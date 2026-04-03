import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import AutocompleteSearch from '../../components/AutocompleteSearch'
import type { AutocompleteItem } from '../../components/AutocompleteSearch'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Client {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  status: string
  created_at: string
  program_name?: string
}


const GOAL_OPTIONS = [
  'Compete in powerlifting',
  'Build strength',
  'Lose weight',
  'General fitness',
  'Other',
]

const EXPERIENCE_OPTIONS = [
  'Just getting started',
  '1 to 3 years',
  '3 or more years',
]

const BLANK_FORM = {
  full_name: '',
  email: '',
  phone: '',
  goal: '',
  experience: '',
  limitations: '',
  squat_max: '',
  bench_max: '',
  deadlift_max: '',
  trainer_notes: '',
}

function initials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

function statusStyle(status: string): { background: string; color: string } {
  switch (status) {
    case 'active':   return { background: 'rgba(74,222,128,0.15)', color: '#4ade80' }
    case 'invited':  return { background: 'rgba(201,168,76,0.15)', color: '#C9A84C' }
    case 'paused':   return { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }
    case 'prospect': return { background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }
    default:         return { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Clients() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [searchFilter, setSearchFilter] = useState<string | null>(null)
  const [searchSelectedId, setSearchSelectedId] = useState<string | null>(null)

  // Invite modal
  const [showInvite, setShowInvite] = useState(false)
  const [form, setForm] = useState(BLANK_FORM)
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchClients = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)

    const { data: rows } = await supabase
      .from('clients')
      .select('id, full_name, email, phone, status, created_at')
      .eq('trainer_id', profile.id)
      .order('created_at', { ascending: false })

    if (!rows) { setLoading(false); return }

    const ids = rows.map(r => r.id)
    const { data: assignments } = await supabase
      .from('client_cycle_assignments')
      .select('client_id, training_cycles(name)')
      .in('client_id', ids)
      .eq('is_active', true)

    const merged: Client[] = rows.map(r => {
      const asgn = (assignments ?? []).find(a => a.client_id === r.id)
      const cycleRaw = asgn?.training_cycles
      const cycle = (Array.isArray(cycleRaw) ? cycleRaw[0] : cycleRaw) as { name: string } | null | undefined
      return { ...r, program_name: cycle?.name }
    })

    setClients(merged)
    setLoading(false)
  }, [profile?.id])

  useEffect(() => { fetchClients() }, [fetchClients])

  // ── Autocomplete fetch ─────────────────────────────────────────────────────

  async function fetchClientResults(query: string): Promise<AutocompleteItem[]> {
    const q = query.toLowerCase()
    return clients
      .filter(c =>
        c.full_name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q)
      )
      .map(c => ({ id: c.id, name: c.full_name }))
  }

  // ── Invite submit ──────────────────────────────────────────────────────────

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim()) {
      setInviteError('Name and email are required.')
      return
    }
    setSaving(true)
    setInviteError('')

    // 1. Insert client record
    const insertData: Record<string, unknown> = {
      trainer_id: profile?.id,
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      status: 'invited',
    }
    if (form.goal)          insertData.goal = form.goal
    if (form.experience)    insertData.experience = form.experience
    if (form.limitations)   insertData.limitations = form.limitations
    if (form.trainer_notes) insertData.trainer_notes = form.trainer_notes
    if (form.phone)         insertData.phone = form.phone

    const { data: inserted, error: insertErr } = await supabase
      .from('clients')
      .insert(insertData)
      .select('id')
      .single()

    if (insertErr || !inserted) {
      setInviteError(insertErr?.message ?? 'Failed to create client.')
      setSaving(false)
      return
    }

    // 2. Insert training maxes if provided
    const maxEntries = [
      { exercise_name: 'Squat', lbs: form.squat_max },
      { exercise_name: 'Bench Press', lbs: form.bench_max },
      { exercise_name: 'Deadlift', lbs: form.deadlift_max },
    ].filter(m => m.lbs.trim() !== '' && !isNaN(parseFloat(m.lbs)))

    if (maxEntries.length > 0) {
      await supabase.from('training_maxes').insert(
        maxEntries.map(m => ({
          client_id: inserted.id,
          trainer_id: profile?.id,
          exercise_name: m.exercise_name,
          max_kg: parseFloat(m.lbs) / 2.2046,
        }))
      )
    }

    // 3. Success — show link screen, trainer closes manually
    setSaving(false)
    setInviteSuccess(true)
    fetchClients()
  }

  function closeModal() {
    if (saving) return
    setShowInvite(false)
    setForm(BLANK_FORM)
    setExpanded(false)
    setInviteError('')
    setInviteSuccess(false)
  }

  // ── Derived list ───────────────────────────────────────────────────────────

  const displayed = searchSelectedId
    ? clients.filter(c => c.id === searchSelectedId)
    : searchFilter
    ? clients.filter(c =>
        c.full_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (c.email ?? '').toLowerCase().includes(searchFilter.toLowerCase())
      )
    : clients

  const activeCount  = clients.filter(c => c.status === 'active').length
  const invitedCount = clients.filter(c => c.status === 'invited').length

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-bebas text-4xl text-white tracking-wide">Clients</h1>
          <p className="font-barlow text-sm text-white/40 mt-0.5">
            {activeCount} active · {invitedCount} invited
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors flex-shrink-0"
        >
          + Invite Client
        </button>
      </div>

      {/* ── Search ── */}
      <div className="mb-5">
        <AutocompleteSearch
          placeholder="Search by name or email..."
          fetchResults={fetchClientResults}
          onSelect={(item: AutocompleteItem) => { setSearchSelectedId(item.id); setSearchFilter(null) }}
          selectedValue=""
        />
        {searchSelectedId && (
          <button
            onClick={() => setSearchSelectedId(null)}
            className="mt-1.5 font-barlow text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            ✕ Clear search
          </button>
        )}
      </div>

      {/* ── Client list ── */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <p className="font-bebas text-xl text-[#C9A84C] tracking-widest">LOADING...</p>
        </div>
      ) : displayed.length === 0 && clients.length === 0 ? (
        /* Empty state */
        <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-16 text-center">
          <div className="w-14 h-14 rounded-full bg-[#C9A84C]/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[#C9A84C]/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="font-bebas text-2xl text-white/20 tracking-wide mb-1">No clients yet</p>
          <p className="font-barlow text-sm text-white/30 mb-5">Invite your first client to get started.</p>
          <button
            onClick={() => setShowInvite(true)}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-6 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
          >
            Invite First Client
          </button>
        </div>
      ) : displayed.length === 0 ? (
        <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-10 text-center">
          <p className="font-barlow text-sm text-white/30 italic">No clients match your search.</p>
        </div>
      ) : (
        <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl overflow-hidden divide-y divide-[#2C2C2E]">
          {displayed.map(client => (
            <button
              key={client.id}
              onClick={() => navigate(`/trainer/clients/${client.id}`)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#242424] transition-colors text-left group"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0">
                <span className="font-bebas text-sm text-[#C9A84C]">{initials(client.full_name)}</span>
              </div>

              {/* Name + email */}
              <div className="flex-1 min-w-0">
                <p className="font-barlow font-semibold text-white text-sm group-hover:text-[#C9A84C] transition-colors truncate">
                  {client.full_name}
                </p>
                {client.email && (
                  <p className="font-barlow text-xs text-white/40 truncate mt-0.5">{client.email}</p>
                )}
              </div>

              {/* Program */}
              <div className="hidden sm:block w-44 flex-shrink-0">
                {client.program_name ? (
                  <p className="font-barlow text-xs text-white/60 truncate">{client.program_name}</p>
                ) : (
                  <p className="font-barlow text-xs text-white/25 italic">No program assigned</p>
                )}
              </div>

              {/* Status badge */}
              <span
                className="font-barlow text-xs px-2.5 py-1 rounded-full flex-shrink-0 capitalize"
                style={statusStyle(client.status)}
              >
                {client.status}
              </span>

              {/* Chevron */}
              <span className="text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0">›</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Invite Modal ── */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#2C2C2E] flex-shrink-0">
              <h2 className="font-bebas text-2xl text-white tracking-wide">Invite Client</h2>
              <button onClick={closeModal} className="text-white/30 hover:text-white transition-colors text-xl">×</button>
            </div>

            {inviteSuccess ? (
              /* Success state — show copyable registration link */
              <div className="flex-1 flex flex-col items-center px-6 py-8 gap-5">
                <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
                  <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="font-bebas text-2xl text-white tracking-wide">{form.full_name} Added!</p>
                  <p className="font-barlow text-sm text-white/40 mt-1">
                    Share this link with them to set up their account.
                  </p>
                </div>
                <div className="w-full bg-[#2C2C2E] border border-[#3A3A3C] rounded-xl px-4 py-3 flex items-center gap-3">
                  <p className="font-barlow text-xs text-white/50 flex-1 truncate">
                    {`${window.location.origin}/register`}
                  </p>
                  <button
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/register`)}
                    className="font-barlow text-xs text-[#C9A84C] hover:text-[#E2C070] transition-colors flex-shrink-0"
                  >
                    Copy
                  </button>
                </div>
                <p className="font-barlow text-xs text-white/25 text-center">
                  Tell {form.full_name.split(' ')[0]} to select "I am a client" and use the email <span className="text-white/40">{form.email}</span>
                </p>
                <button
                  onClick={closeModal}
                  className="w-full bg-[#C9A84C] text-black font-bebas text-sm tracking-widest py-3 rounded-xl hover:bg-[#E2C070] transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="flex-1 overflow-y-auto">
                <div className="px-6 py-5 flex flex-col gap-4">

                  {inviteError && (
                    <p className="font-barlow text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                      {inviteError}
                    </p>
                  )}

                  {/* Full name */}
                  <div className="flex flex-col gap-1.5">
                    <label className="font-barlow text-xs text-white/50 uppercase tracking-wider">Full Name *</label>
                    <input
                      type="text"
                      value={form.full_name}
                      onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                      placeholder="Jane Smith"
                      autoFocus
                      required
                      className="bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-4 py-2.5 font-barlow text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/60"
                    />
                  </div>

                  {/* Email */}
                  <div className="flex flex-col gap-1.5">
                    <label className="font-barlow text-xs text-white/50 uppercase tracking-wider">Email *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="jane@email.com"
                      required
                      className="bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-4 py-2.5 font-barlow text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/60"
                    />
                  </div>

                  {/* Expandable pre-fill section */}
                  <div className="border border-[#2C2C2E] rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpanded(e => !e)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#242424] transition-colors"
                    >
                      <span className="font-barlow text-sm text-white/60">Pre-fill client details</span>
                      <span className={`text-white/30 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>▾</span>
                    </button>

                    {expanded && (
                      <div className="px-4 pb-4 flex flex-col gap-4 border-t border-[#2C2C2E] pt-4">

                        {/* Goal */}
                        <div className="flex flex-col gap-2">
                          <label className="font-barlow text-xs text-white/50 uppercase tracking-wider">Goal</label>
                          <div className="flex flex-wrap gap-2">
                            {GOAL_OPTIONS.map(g => (
                              <button
                                key={g}
                                type="button"
                                onClick={() => setForm(f => ({ ...f, goal: f.goal === g ? '' : g }))}
                                className="font-barlow text-xs px-3 py-1.5 rounded-full border transition-colors"
                                style={form.goal === g
                                  ? { background: '#C9A84C', color: '#000', borderColor: '#C9A84C' }
                                  : { background: 'transparent', color: 'rgba(255,255,255,0.5)', borderColor: '#3A3A3C' }
                                }
                              >
                                {g}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Experience */}
                        <div className="flex flex-col gap-2">
                          <label className="font-barlow text-xs text-white/50 uppercase tracking-wider">Experience</label>
                          <div className="flex flex-wrap gap-2">
                            {EXPERIENCE_OPTIONS.map(ex => (
                              <button
                                key={ex}
                                type="button"
                                onClick={() => setForm(f => ({ ...f, experience: f.experience === ex ? '' : ex }))}
                                className="font-barlow text-xs px-3 py-1.5 rounded-full border transition-colors"
                                style={form.experience === ex
                                  ? { background: '#C9A84C', color: '#000', borderColor: '#C9A84C' }
                                  : { background: 'transparent', color: 'rgba(255,255,255,0.5)', borderColor: '#3A3A3C' }
                                }
                              >
                                {ex}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Injuries / limitations */}
                        <div className="flex flex-col gap-1.5">
                          <label className="font-barlow text-xs text-white/50 uppercase tracking-wider">Injuries or Limitations</label>
                          <textarea
                            value={form.limitations}
                            onChange={e => setForm(f => ({ ...f, limitations: e.target.value }))}
                            placeholder="Any injuries, mobility restrictions, or movements to avoid..."
                            rows={2}
                            className="bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-4 py-2.5 font-barlow text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/60 resize-none"
                          />
                        </div>

                        {/* Training maxes */}
                        <div className="flex flex-col gap-1.5">
                          <label className="font-barlow text-xs text-white/50 uppercase tracking-wider">Starting Maxes (lbs)</label>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { key: 'squat_max', label: 'Squat' },
                              { key: 'bench_max', label: 'Bench' },
                              { key: 'deadlift_max', label: 'Deadlift' },
                            ].map(({ key, label }) => (
                              <div key={key} className="flex flex-col gap-1">
                                <span className="font-barlow text-xs text-white/30 text-center">{label}</span>
                                <input
                                  type="number"
                                  value={form[key as keyof typeof form]}
                                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                  placeholder="0"
                                  min="0"
                                  className="bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-3 py-2 font-barlow text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/60 text-center"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Trainer notes */}
                        <div className="flex flex-col gap-1.5">
                          <label className="font-barlow text-xs text-white/50 uppercase tracking-wider">
                            Trainer Notes
                            <span className="normal-case text-white/25 ml-2 font-normal">Only you can see this</span>
                          </label>
                          <textarea
                            value={form.trainer_notes}
                            onChange={e => setForm(f => ({ ...f, trainer_notes: e.target.value }))}
                            placeholder="Private notes about this client..."
                            rows={2}
                            className="bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-4 py-2.5 font-barlow text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/60 resize-none"
                          />
                        </div>

                      </div>
                    )}
                  </div>

                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 pb-6 flex-shrink-0">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={saving}
                    className="flex-1 font-barlow text-sm text-white/40 border border-[#2C2C2E] rounded-xl py-3 hover:text-white hover:border-[#3A3A3C] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-[#C9A84C] text-black font-bebas text-sm tracking-widest py-3 rounded-xl hover:bg-[#E2C070] transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
