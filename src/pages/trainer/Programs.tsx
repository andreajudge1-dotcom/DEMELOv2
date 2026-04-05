import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Select from '../../components/Select'

interface Program {
  id: string
  name: string
  description: string | null
  cover_photo_url: string | null
  num_days: number
  num_weeks: number
  tags: string[] | null
  created_at: string
}

interface ActiveAssignment {
  id: string
  cycle_id: string
  next_day_number: number
  started_at: string | null
  client_name: string
  program_name: string
  num_days: number
  num_weeks: number
  cover_photo_url: string | null
  tags: string[] | null
}

interface Client {
  id: string
  full_name: string
}

const COVER_PHOTOS = [
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=80',
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600&q=80',
  'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=600&q=80',
  'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&q=80',
]

function getCover(url: string | null, index: number) {
  return url ?? COVER_PHOTOS[index % COVER_PHOTOS.length]
}

// Deep-copy a training cycle and all its workouts/exercises/sets
async function copyProgram(
  sourceCycleId: string,
  trainerId: string,
  overrides: { name?: string } = {}
): Promise<string | null> {
  const { data: cycle } = await supabase
    .from('training_cycles')
    .select('*')
    .eq('id', sourceCycleId)
    .single()
  if (!cycle) return null

  const { data: newCycle } = await supabase
    .from('training_cycles')
    .insert({
      trainer_id: trainerId,
      name: overrides.name ?? cycle.name,
      description: cycle.description ?? null,
      cover_photo_url: cycle.cover_photo_url ?? null,
      num_days: cycle.num_days,
      num_weeks: cycle.num_weeks ?? 4,
      is_template: false,
      tags: cycle.tags ?? [],
    })
    .select()
    .single()
  if (!newCycle) return null

  const { data: workouts } = await supabase
    .from('workouts')
    .select('id, day_number, name, focus')
    .eq('cycle_id', sourceCycleId)
    .order('day_number')

  for (const w of workouts ?? []) {
    const { data: newWorkout } = await supabase
      .from('workouts')
      .insert({ cycle_id: newCycle.id, day_number: w.day_number, name: w.name, focus: w.focus ?? null })
      .select()
      .single()
    if (!newWorkout) continue

    const { data: wes } = await supabase
      .from('workout_exercises')
      .select('id, exercise_id, position, superset_group, cue_override, notes')
      .eq('workout_id', w.id)
      .order('position')

    for (const we of wes ?? []) {
      const { data: newWE } = await supabase
        .from('workout_exercises')
        .insert({
          workout_id: newWorkout.id,
          exercise_id: we.exercise_id,
          position: we.position,
          superset_group: (we as any).superset_group ?? null,
          cue_override: (we as any).cue_override ?? null,
          notes: we.notes ?? null,
        })
        .select()
        .single()
      if (!newWE) continue

      const { data: sets } = await supabase
        .from('workout_set_prescriptions')
        .select('*')
        .eq('workout_exercise_id', we.id)
        .order('set_number')

      if (sets?.length) {
        await supabase.from('workout_set_prescriptions').insert(
          sets.map(s => ({
            workout_exercise_id: newWE.id,
            set_number: s.set_number,
            set_type: s.set_type,
            reps: s.reps ?? null,
            rpe_target: s.rpe_target ?? null,
            load_modifier: s.load_modifier ?? null,
            hold_seconds: s.hold_seconds ?? null,
            tempo: s.tempo ?? null,
            cue: s.cue ?? null,
          }))
        )
      }
    }
  }

  return newCycle.id
}

export default function Programs() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<'library' | 'active'>('library')
  const [programs, setPrograms] = useState<Program[]>([])
  const [activeAssignments, setActiveAssignments] = useState<ActiveAssignment[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')

  // Assign modal state
  const [assignProgram, setAssignProgram] = useState<Program | null>(null)
  const [assignClientId, setAssignClientId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState('')
  const [assignSuccess, setAssignSuccess] = useState('')

  // Delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [programsRes, assignRes, clientsRes] = await Promise.all([
      supabase
        .from('training_cycles')
        .select('id, name, description, cover_photo_url, num_days, num_weeks, tags, created_at')
        .eq('trainer_id', profile?.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('client_cycle_assignments')
        .select('id, cycle_id, next_day_number, started_at, clients(full_name), training_cycles(name, num_days, num_weeks, cover_photo_url, tags)')
        .eq('trainer_id', profile?.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('clients')
        .select('id, full_name')
        .eq('trainer_id', profile?.id)
        .eq('status', 'active')
        .order('full_name'),
    ])

    setPrograms(programsRes.data ?? [])
    setClients(clientsRes.data ?? [])

    const assignments: ActiveAssignment[] = (assignRes.data ?? []).map((a: any) => {
      const tc = Array.isArray(a.training_cycles) ? a.training_cycles[0] : a.training_cycles
      const cl = Array.isArray(a.clients) ? a.clients[0] : a.clients
      return {
        id: a.id,
        cycle_id: a.cycle_id,
        next_day_number: a.next_day_number,
        started_at: a.started_at,
        client_name: cl?.full_name ?? 'Unknown client',
        program_name: tc?.name ?? 'Unknown program',
        num_days: tc?.num_days ?? 0,
        num_weeks: tc?.num_weeks ?? 0,
        cover_photo_url: tc?.cover_photo_url ?? null,
        tags: tc?.tags ?? [],
      }
    })
    setActiveAssignments(assignments)
    setLoading(false)
  }

  async function handleAssign() {
    if (!assignProgram || !assignClientId || !profile?.id) return
    setAssigning(true)
    setAssignError('')
    setAssignSuccess('')

    // Copy the library program
    const newCycleId = await copyProgram(assignProgram.id, profile.id)
    if (!newCycleId) {
      setAssignError('Failed to copy program. Please try again.')
      setAssigning(false)
      return
    }

    // Deactivate any existing active assignment for this client
    await supabase
      .from('client_cycle_assignments')
      .update({ is_active: false, status: 'completed' })
      .eq('client_id', assignClientId)
      .eq('is_active', true)

    // Create assignment to the copy
    const { error: assignErr } = await supabase.from('client_cycle_assignments').insert({
      client_id: assignClientId,
      cycle_id: newCycleId,
      is_active: true,
      next_day_number: 1,
    })

    if (assignErr) {
      setAssignError(assignErr.message)
      setAssigning(false)
      return
    }

    setAssigning(false)
    setAssignSuccess(`Assigned to ${clients.find(c => c.id === assignClientId)?.full_name ?? 'client'}`)
    fetchAll()
  }

  async function deleteProgram(id: string) {
    setDeleting(true)
    await supabase.from('training_cycles').delete().eq('id', id)
    setPrograms(prev => prev.filter(p => p.id !== id))
    setConfirmDeleteId(null)
    setDeleting(false)
  }

  const filteredLibrary = programs.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (tagFilter && !(p.tags ?? []).includes(tagFilter)) return false
    return true
  })

  const filteredActive = activeAssignments.filter(a => {
    if (search && !a.program_name.toLowerCase().includes(search.toLowerCase()) && !a.client_name.toLowerCase().includes(search.toLowerCase())) return false
    if (tagFilter && !(a.tags ?? []).includes(tagFilter)) return false
    return true
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="font-barlow text-white/40">Loading programs...</p>
    </div>
  )

  return (
    <div className="max-w-5xl">
      {/* Banner */}
      <div className="relative h-48 rounded-2xl overflow-hidden mb-8">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&q=80)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/90 via-[#0A0A0A]/50 to-transparent" />
        <div className="relative h-full flex flex-col justify-end px-8 pb-6">
          <h1 className="font-bebas text-4xl text-white tracking-wide">Programs</h1>
          <p className="font-barlow text-sm text-white/50 mt-1">
            {programs.length} in library · {activeAssignments.length} active
          </p>
        </div>
        <div className="absolute bottom-6 right-6">
          <button
            onClick={() => navigate('/trainer/programs/new')}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
          >
            + New Program
          </button>
        </div>
      </div>

      {/* Search + tag filter */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <input
          type="text"
          placeholder="Search programs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-48 bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-2.5 text-white font-barlow text-sm placeholder:text-white/20 focus:outline-none focus:border-[#C9A84C] transition-colors"
        />
        <Select
          value={tagFilter}
          onChange={val => setTagFilter(val)}
          placeholder="All tags"
          options={['Strength','Hypertrophy','Power','Conditioning','Beginner','Fat Loss','Sport Specific','Rehab'].map(tag => ({ value: tag, label: tag }))}
          className="w-44"
        />
        {(tagFilter || search) && (
          <button
            onClick={() => { setTagFilter(''); setSearch('') }}
            className="font-barlow text-xs text-white/40 hover:text-white transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[#2C2C2E]">
        {(['library', 'active'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`font-barlow text-sm px-4 py-2.5 capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'text-[#C9A84C] border-[#C9A84C]'
                : 'text-white/40 border-transparent hover:text-white/60'
            }`}
          >
            {tab === 'library' ? 'Library' : 'Active'}
            <span className="ml-1.5 text-xs text-white/30">
              {tab === 'library' ? programs.length : activeAssignments.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── LIBRARY TAB ── */}
      {activeTab === 'library' && (
        filteredLibrary.length === 0 ? (
          <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-16 text-center">
            <p className="font-bebas text-2xl text-white/20 tracking-wide mb-2">No programs yet</p>
            <p className="font-barlow text-sm text-white/30 mb-6">Build your first program to get started</p>
            <button
              onClick={() => navigate('/trainer/programs/new')}
              className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-6 py-3 rounded-lg hover:bg-[#E2C070] transition-colors"
            >
              Build First Program
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filteredLibrary.map((program, i) => (
              <div
                key={program.id}
                className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] overflow-hidden hover:border-[#3A3A3C] transition-colors group relative"
              >
                {/* Cover */}
                <div
                  onClick={() => navigate(`/trainer/programs/${program.id}`)}
                  className="h-32 bg-cover bg-center relative cursor-pointer"
                  style={{ backgroundImage: `url(${getCover(program.cover_photo_url, i)})` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-[#1C1C1E] via-[#1C1C1E]/30 to-transparent" />
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(program.id) }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white/40 hover:text-[#E05555] hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3
                    onClick={() => navigate(`/trainer/programs/${program.id}`)}
                    className="font-bebas text-lg text-white tracking-wide hover:text-[#C9A84C] transition-colors cursor-pointer"
                  >
                    {program.name}
                  </h3>
                  {program.description && (
                    <p className="font-barlow text-xs text-white/40 mt-1 line-clamp-2">{program.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="font-barlow text-xs text-white/40">{program.num_days}d/wk · {program.num_weeks}wk</span>
                  </div>
                  {(program.tags ?? []).length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-2">
                      {(program.tags ?? []).map(tag => (
                        <span key={tag} className="font-barlow text-xs px-2 py-0.5 rounded-full bg-[#C9A84C]/10 text-[#C9A84C]/70 border border-[#C9A84C]/20">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Assign button */}
                  <button
                    onClick={() => {
                      setAssignProgram(program)
                      setAssignClientId('')
                      setAssignError('')
                      setAssignSuccess('')
                    }}
                    className="mt-3 w-full font-barlow text-xs text-[#C9A84C] border border-[#C9A84C]/30 rounded-lg py-1.5 hover:bg-[#C9A84C]/10 transition-colors"
                  >
                    Assign to Client
                  </button>
                </div>
              </div>
            ))}

            {/* New program card */}
            <div
              onClick={() => navigate('/trainer/programs/new')}
              className="bg-[#141414] rounded-xl border border-dashed border-[#2C2C2E] overflow-hidden cursor-pointer hover:border-[#C9A84C] transition-colors flex flex-col items-center justify-center min-h-[180px] gap-2"
            >
              <div className="w-9 h-9 rounded-full border border-[#2C2C2E] flex items-center justify-center text-white/20 text-lg">+</div>
              <span className="font-bebas text-sm text-white/20 tracking-widest">New Program</span>
            </div>
          </div>
        )
      )}

      {/* ── ACTIVE TAB ── */}
      {activeTab === 'active' && (
        filteredActive.length === 0 ? (
          <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-16 text-center">
            <p className="font-bebas text-2xl text-white/20 tracking-wide mb-2">No active assignments</p>
            <p className="font-barlow text-sm text-white/30">Assign a library program to a client to see it here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredActive.map((a, i) => {
              const currentWeek = Math.ceil(a.next_day_number / Math.max(a.num_days, 1))
              const pct = Math.min(100, Math.round(((a.next_day_number - 1) / Math.max(a.num_days * a.num_weeks, 1)) * 100))
              return (
                <div key={a.id} className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl overflow-hidden flex">
                  <div
                    className="w-20 h-auto bg-cover bg-center flex-shrink-0"
                    style={{ backgroundImage: `url(${getCover(a.cover_photo_url, i)})` }}
                  />
                  <div className="flex-1 px-5 py-4 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-barlow font-semibold text-white truncate">{a.program_name}</p>
                        <p className="font-barlow text-xs text-[#C9A84C] mt-0.5">{a.client_name}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-barlow text-xs text-white/50">Week {currentWeek} of {a.num_weeks}</p>
                        <p className="font-barlow text-xs text-white/30 mt-0.5">{a.num_days}d/wk</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1 bg-[#2C2C2E] rounded-full overflow-hidden">
                      <div className="h-full bg-[#C9A84C] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    {(a.tags ?? []).length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {(a.tags ?? []).map(tag => (
                          <span key={tag} className="font-barlow text-xs px-2 py-0.5 rounded-full bg-[#C9A84C]/10 text-[#C9A84C]/70 border border-[#C9A84C]/20">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── Assign to Client Modal ── */}
      {assignProgram && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-sm">
            <div className="px-6 pt-6 pb-4 border-b border-[#2C2C2E]">
              <h2 className="font-bebas text-2xl text-white tracking-wide">Assign to Client</h2>
              <p className="font-barlow text-sm text-white/40 mt-0.5">{assignProgram.name}</p>
              <p className="font-barlow text-xs text-white/25 mt-1">A copy will be created for the client. The library original is untouched.</p>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              {assignSuccess ? (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-center">
                  <p className="font-bebas text-lg text-green-400 tracking-wide">Assigned!</p>
                  <p className="font-barlow text-xs text-white/40 mt-0.5">{assignSuccess}</p>
                </div>
              ) : (
                <>
                  {assignError && (
                    <p className="font-barlow text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{assignError}</p>
                  )}
                  {clients.length === 0 ? (
                    <p className="font-barlow text-sm text-white/40 italic text-center py-2">No active clients yet.</p>
                  ) : (
                    <Select
                      value={assignClientId}
                      onChange={setAssignClientId}
                      placeholder="Select a client..."
                      options={clients.map(c => ({ value: c.id, label: c.full_name }))}
                    />
                  )}
                  <button
                    onClick={handleAssign}
                    disabled={assigning || !assignClientId}
                    className="w-full bg-[#C9A84C] text-black font-bebas text-base tracking-widest py-3 rounded-xl hover:bg-[#E2C070] transition-colors disabled:opacity-40"
                  >
                    {assigning ? 'Assigning...' : 'Assign Program'}
                  </button>
                </>
              )}
              <button
                onClick={() => { setAssignProgram(null); setAssignSuccess('') }}
                className="w-full font-barlow text-sm text-white/30 hover:text-white/60 transition-colors py-1"
              >
                {assignSuccess ? 'Done' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-sm p-6 flex flex-col gap-5">
            <div>
              <h2 className="font-bebas text-2xl text-white tracking-wide">Delete program?</h2>
              <p className="font-barlow text-sm text-white/40 mt-1">
                This removes it from your library. Client copies already assigned are not affected.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2.5 font-barlow text-sm text-white/60 hover:text-white border border-[#2C2C2E] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteProgram(confirmDeleteId)}
                disabled={deleting}
                className="flex-1 py-2.5 font-bebas text-sm tracking-widest bg-[#E05555] text-white rounded-lg hover:bg-[#c94444] transition-colors disabled:opacity-50"
              >
                {deleting ? 'DELETING...' : 'DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
