import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import AutocompleteSearch from '../../components/AutocompleteSearch'

interface Client {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  status: string
  created_at: string
  program_name?: string
  last_session?: string | null
}

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-500/20 text-green-400',
  invited:  'bg-blue-500/20 text-blue-400',
  paused:   'bg-yellow-500/20 text-yellow-400',
  inactive: 'bg-white/10 text-white/40',
  prospect: 'bg-purple-500/20 text-purple-400',
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function daysSinceLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return 'No sessions yet'
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  return `${d}d ago`
}

const BLANK_FORM = { full_name: '', email: '', phone: '' }

// The URL clients land on when they click the invite email
const ONBOARDING_URL = `${window.location.origin}/onboarding`

export default function Clients() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Add client modal
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Post-save: invite prompt
  const [newClientId, setNewClientId] = useState<string | null>(null)
  const [newClientEmail, setNewClientEmail] = useState<string | null>(null)
  const [newClientName, setNewClientName] = useState<string>('')
  const [showInvitePrompt, setShowInvitePrompt] = useState(false)

  // Client search
  const [searchedClientId, setSearchedClientId] = useState<string | null>(null)

  // Inline invite sending on list rows
  const [sendingInvite, setSendingInvite] = useState<string | null>(null)   // client id
  const [inviteSent, setInviteSent] = useState<Record<string, boolean>>({})
  const [inviteError, setInviteError] = useState<Record<string, string>>({})

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    const { data: clientRows } = await supabase
      .from('clients')
      .select('id, full_name, email, phone, status, created_at')
      .eq('trainer_id', profile?.id)
      .order('full_name')

    if (!clientRows) { setLoading(false); return }

    const ids = clientRows.map(c => c.id)
    const { data: assignments } = await supabase
      .from('client_cycle_assignments')
      .select('client_id, training_cycles(name)')
      .in('client_id', ids)
      .eq('is_active', true)

    const { data: lastSessions } = await supabase
      .from('sessions')
      .select('client_id, completed_at')
      .in('client_id', ids)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })

    const merged: Client[] = clientRows.map(c => {
      const asgn = (assignments ?? []).find(a => a.client_id === c.id)
      const sess = (lastSessions ?? []).find(s => s.client_id === c.id)
      const cycleRaw = asgn?.training_cycles
      const cycle = (Array.isArray(cycleRaw) ? cycleRaw[0] : cycleRaw) as { name: string } | null | undefined
      return {
        ...c,
        program_name: cycle?.name ?? undefined,
        last_session: sess?.completed_at ?? null,
      }
    })

    setClients(merged)
    setLoading(false)
  }

  // ── Add Client ──────────────────────────────────────────────────────────────

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')

    const insertData: Record<string, unknown> = {
      trainer_id: profile?.id,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      status: 'prospect',
    }
    if (form.phone.trim()) insertData.phone = form.phone.trim()

    const { data: inserted, error: err } = await supabase
      .from('clients')
      .insert(insertData)
      .select('id')
      .single()

    if (err || !inserted) { setError(err?.message ?? 'Failed to save'); setSaving(false); return }

    setSaving(false)
    setShowAdd(false)
    fetchClients()

    // If they have an email, offer to send invite immediately
    if (form.email.trim()) {
      setNewClientId(inserted.id)
      setNewClientEmail(form.email.trim())
      setNewClientName(form.full_name.trim())
      setShowInvitePrompt(true)
    }

    setForm(BLANK_FORM)
  }

  // ── Send invite (reusable) ──────────────────────────────────────────────────

  async function sendInvite(email: string, clientId: string) {
    setSendingInvite(clientId)
    setInviteError(prev => ({ ...prev, [clientId]: '' }))

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: ONBOARDING_URL,
        shouldCreateUser: true,
      },
    })

    if (err) {
      setInviteError(prev => ({ ...prev, [clientId]: err.message }))
    } else {
      setInviteSent(prev => ({ ...prev, [clientId]: true }))
      // Update client status to 'invited' if not already active
      const client = clients.find(c => c.id === clientId)
      if (client && client.status !== 'active') {
        await supabase.from('clients').update({ status: 'invited' }).eq('id', clientId)
        fetchClients()
      }
    }
    setSendingInvite(null)
  }

  // ── Search fetch (used by AutocompleteSearch) ─────────────────────────────

  async function fetchClientResults(query: string) {
    return clients
      .filter(c => c.full_name.toLowerCase().includes(query.toLowerCase()))
      .map(c => ({ id: c.id, name: c.full_name }))
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filtered = (() => {
    let list = statusFilter === 'all' ? clients : clients.filter(c => c.status === statusFilter)
    if (searchedClientId) list = list.filter(c => c.id === searchedClientId)
    return list
  })()

  const counts = {
    all: clients.length,
    active: clients.filter(c => c.status === 'active').length,
    invited: clients.filter(c => c.status === 'invited').length,
    paused: clients.filter(c => c.status === 'paused').length,
  }

  return (
    <div className="max-w-5xl">
      {/* Banner */}
      <div className="relative h-48 rounded-2xl overflow-hidden mb-8">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1600&q=80)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/90 via-[#0A0A0A]/50 to-transparent" />
        <div className="relative h-full flex flex-col justify-end px-8 pb-6">
          <h1 className="font-bebas text-4xl text-white tracking-wide">Clients</h1>
          <p className="font-barlow text-sm text-white/50 mt-1">{clients.length} total · {counts.active} active</p>
        </div>
        <div className="absolute bottom-6 right-6">
          <button
            onClick={() => setShowAdd(true)}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
          >
            + Add Client
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <AutocompleteSearch
          placeholder="Search clients by name..."
          fetchResults={fetchClientResults}
          onSelect={item => setSearchedClientId(item.id)}
          selectedValue=""
          className="max-w-sm"
        />
        {searchedClientId && (
          <button
            onClick={() => setSearchedClientId(null)}
            className="mt-1.5 font-barlow text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            ✕ Clear search
          </button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-5 border-b border-[#2C2C2E]">
        {(['all', 'active', 'invited', 'paused'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`font-barlow text-sm px-4 py-2 capitalize border-b-2 -mb-px transition-colors ${
              statusFilter === s
                ? 'text-[#C9A84C] border-[#C9A84C]'
                : 'text-white/40 border-transparent hover:text-white/60'
            }`}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            <span className="ml-1.5 font-barlow text-xs text-white/30">{counts[s]}</span>
          </button>
        ))}
      </div>

      {/* Client list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <p className="font-bebas text-xl text-[#C9A84C] tracking-widest">LOADING...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-16 text-center">
          <p className="font-bebas text-2xl text-white/20 tracking-wide mb-2">No Clients Yet</p>
          <p className="font-barlow text-sm text-white/30 mb-4">Add your first client to get started.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
          >
            + Add Client
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(client => (
            <div key={client.id} className="bg-[#1C1C1E] border border-[#2C2C2E] hover:border-[#3A3A3C] rounded-xl transition-colors">
              {/* Main row — click to open profile */}
              <div
                className="px-5 py-4 flex items-center gap-4 cursor-pointer group"
                onClick={() => navigate(`/trainer/clients/${client.id}`)}
              >
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0">
                  <span className="font-bebas text-base text-[#C9A84C]">{initials(client.full_name)}</span>
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <p className="font-barlow font-semibold text-white group-hover:text-[#C9A84C] transition-colors truncate">
                    {client.full_name}
                  </p>
                  {client.email && (
                    <p className="font-barlow text-xs text-white/40 truncate mt-0.5">{client.email}</p>
                  )}
                </div>

                {/* Status badge */}
                <span className={`font-barlow text-xs px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_COLORS[client.status] ?? 'bg-white/10 text-white/40'}`}>
                  {client.status}
                </span>

                {/* Program */}
                <div className="w-44 flex-shrink-0 hidden md:block">
                  {client.program_name ? (
                    <p className="font-barlow text-sm text-white/70 truncate">{client.program_name}</p>
                  ) : (
                    <p className="font-barlow text-sm text-white/25 italic">No program</p>
                  )}
                </div>

                {/* Last session */}
                <div className="w-28 flex-shrink-0 text-right hidden sm:block">
                  <p className="font-barlow text-xs text-white/40">{daysSinceLabel(client.last_session)}</p>
                </div>

                <span className="text-white/20 group-hover:text-white/60 transition-colors flex-shrink-0">›</span>
              </div>

              {/* Invite row — only shown for clients with email who aren't active yet */}
              {client.email && client.status !== 'active' && (
                <div className="px-5 pb-3 flex items-center gap-3 border-t border-[#2C2C2E]/60">
                  {inviteSent[client.id] ? (
                    <p className="font-barlow text-xs text-green-400 py-1">
                      ✓ Invite sent to {client.email}
                    </p>
                  ) : (
                    <>
                      <button
                        onClick={() => sendInvite(client.email!, client.id)}
                        disabled={sendingInvite === client.id}
                        className="font-barlow text-xs text-[#C9A84C] hover:text-[#E2C070] transition-colors disabled:opacity-40 py-1"
                      >
                        {sendingInvite === client.id ? 'Sending...' : '↗ Send Invite Email'}
                      </button>
                      {inviteError[client.id] && (
                        <p className="font-barlow text-xs text-red-400">{inviteError[client.id]}</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add Client Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-md">
            <div className="px-6 pt-6 pb-2 border-b border-[#2C2C2E]">
              <h2 className="font-bebas text-2xl text-white tracking-wide">Add Client</h2>
              <p className="font-barlow text-sm text-white/40 mt-0.5">Add a client to your roster</p>
            </div>

            <form onSubmit={handleAddClient} className="px-6 py-5 flex flex-col gap-4">
              {error && (
                <p className="font-barlow text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="font-barlow text-xs text-white/50 uppercase tracking-wider">Full Name *</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Jane Smith"
                  autoFocus
                  className="bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-4 py-2.5 font-barlow text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-barlow text-xs text-white/50 uppercase tracking-wider">
                  Email <span className="text-white/25 normal-case ml-1">— used to send invite</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@email.com"
                  className="bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-4 py-2.5 font-barlow text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-barlow text-xs text-white/50 uppercase tracking-wider">Phone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                    let formatted = digits
                    if (digits.length > 6) formatted = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
                    else if (digits.length > 3) formatted = `(${digits.slice(0,3)}) ${digits.slice(3)}`
                    else if (digits.length > 0) formatted = `(${digits}`
                    setForm(f => ({ ...f, phone: formatted }))
                  }}
                  placeholder="(555) 000-0000"
                  maxLength={14}
                  className="bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-4 py-2.5 font-barlow text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/50"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setForm(BLANK_FORM); setError('') }}
                  className="flex-1 font-barlow text-sm text-white/40 border border-[#2C2C2E] rounded-xl py-2.5 hover:text-white hover:border-[#3A3A3C] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-[#C9A84C] text-black font-bebas text-sm tracking-widest py-2.5 rounded-xl hover:bg-[#E2C070] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Add Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Post-add Invite Prompt ── */}
      {showInvitePrompt && newClientId && newClientEmail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-sm">
            <div className="px-6 pt-6 pb-5">
              <div className="w-12 h-12 rounded-full bg-[#C9A84C]/15 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="font-bebas text-2xl text-white tracking-wide">
                {newClientName} added!
              </h2>
              <p className="font-barlow text-sm text-white/50 mt-1">
                Send them an invite link so they can set up their account and complete onboarding.
              </p>
              <p className="font-barlow text-xs text-white/30 mt-2 bg-[#2C2C2E] px-3 py-2 rounded-lg truncate">
                {newClientEmail}
              </p>
            </div>

            <div className="px-6 pb-5 flex flex-col gap-3">
              {inviteSent[newClientId] ? (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-center">
                  <p className="font-bebas text-lg text-green-400 tracking-wide">Invite Sent!</p>
                  <p className="font-barlow text-xs text-white/40 mt-0.5">They'll receive an email with a link to get started.</p>
                </div>
              ) : (
                <button
                  onClick={() => sendInvite(newClientEmail, newClientId)}
                  disabled={sendingInvite === newClientId}
                  className="w-full bg-[#C9A84C] text-black font-bebas text-base tracking-widest py-3 rounded-xl hover:bg-[#E2C070] transition-colors disabled:opacity-40"
                >
                  {sendingInvite === newClientId ? 'Sending...' : 'Send Invite Email'}
                </button>
              )}

              {inviteError[newClientId] && (
                <p className="font-barlow text-xs text-red-400 text-center">{inviteError[newClientId]}</p>
              )}

              <button
                onClick={() => { setShowInvitePrompt(false); setNewClientId(null); setNewClientEmail(null) }}
                className="w-full font-barlow text-sm text-white/30 hover:text-white/60 transition-colors py-1"
              >
                {inviteSent[newClientId] ? 'Done' : 'Skip for now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
