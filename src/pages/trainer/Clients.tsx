import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Select from '../../components/Select'

interface Client {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  status: string
  created_at: string
  // joined from assignment
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

const BLANK_FORM = { full_name: '', email: '', phone: '', status: 'active' }

export default function Clients() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    const { data: clientRows } = await supabase
      .from('clients')
      .select('id, full_name, email, phone, status, created_at')
      .eq('trainer_id', profile?.id)
      .order('full_name')

    if (!clientRows) { setLoading(false); return }

    // Fetch active assignments for all clients
    const ids = clientRows.map(c => c.id)
    const { data: assignments } = await supabase
      .from('client_cycle_assignments')
      .select('client_id, training_cycles(name)')
      .in('client_id', ids)
      .eq('is_active', true)

    // Fetch last session for each client
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

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    const insertData: Record<string, unknown> = {
      trainer_id: profile?.id,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      status: form.status,
    }
    if (form.phone.trim()) insertData.phone = form.phone.trim()
    const { error: err } = await supabase.from('clients').insert(insertData)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false)
    setShowAdd(false)
    setForm(BLANK_FORM)
    fetchClients()
  }

  const filtered = statusFilter === 'all'
    ? clients
    : clients.filter(c => c.status === statusFilter)

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
            <button
              key={client.id}
              onClick={() => navigate(`/trainer/clients/${client.id}`)}
              className="bg-[#1C1C1E] border border-[#2C2C2E] hover:border-[#3A3A3C] rounded-xl px-5 py-4 flex items-center gap-4 text-left transition-colors group"
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

              {/* Status */}
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
            </button>
          ))}
        </div>
      )}

      {/* Add Client Modal */}
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
                  className="bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-4 py-2.5 font-barlow text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-barlow text-xs text-white/50 uppercase tracking-wider">Email</label>
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
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="+1 (555) 000-0000"
                  className="bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-4 py-2.5 font-barlow text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-barlow text-xs text-white/50 uppercase tracking-wider">Status</label>
                <Select
                  value={form.status}
                  onChange={v => setForm(f => ({ ...f, status: v }))}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'invited', label: 'Invited' },
                    { value: 'paused', label: 'Paused' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
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
    </div>
  )
}
