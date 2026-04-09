import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import mammoth from 'mammoth'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Select from '../../components/Select'

// ── Types for AI-parsed program ──────────────────────────────────────────────

interface ParsedSet {
  set_number: number
  reps_min: number
  reps_max: number
  set_type: string
  special_instructions: string | null
}

interface ParsedExercise {
  name: string
  superset_with: string | null
  coaching_notes: string
  sets: ParsedSet[]
}

interface ParsedDay {
  day_number: number
  day_name: string
  focus: string
  exercises: ParsedExercise[]
}

interface ParsedProgram {
  program_name: string
  weeks: number
  days: ParsedDay[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Map AI set_type values to valid DB enum values
const VALID_SET_TYPES = new Set(['warmup', 'working', 'backoff', 'drop', 'myorep', 'amrap', 'tempo', 'pause'])
function normalizeSetType(t: string): string {
  return VALID_SET_TYPES.has(t) ? t : 'working'
}

function formatReps(min: number, max: number): string {
  if (!min && !max) return ''
  if (!max || min === max) return String(min || max)
  return `${min}-${max}`
}

// Look up an exercise by name (case-insensitive) across global + trainer exercises.
// Creates a new trainer-custom exercise if no match is found.
// NEVER returns null — this guarantees workout_exercises.exercise_id is always set.
async function resolveOrCreateExercise(name: string, trainerId: string): Promise<string> {
  const trimmed = name.trim()

  // 1. Try global exercises (case-insensitive)
  const { data: globalMatch } = await supabase
    .from('exercises')
    .select('id')
    .ilike('name', trimmed)
    .eq('is_global', true)
    .limit(1)
    .maybeSingle()
  if (globalMatch?.id) return globalMatch.id

  // 2. Try trainer's custom exercises
  const { data: trainerMatch } = await supabase
    .from('exercises')
    .select('id')
    .ilike('name', trimmed)
    .eq('trainer_id', trainerId)
    .limit(1)
    .maybeSingle()
  if (trainerMatch?.id) return trainerMatch.id

  // 3. Create a new trainer-custom exercise
  const { data: newEx } = await supabase
    .from('exercises')
    .insert({
      trainer_id: trainerId,
      name: trimmed,
      is_global: false,
      primary_muscle: '',
      equipment: '',
      movement_pattern: '',
      difficulty: '',
      is_unilateral: false,
      per_side: false,
    })
    .select('id')
    .single()

  if (!newEx?.id) throw new Error(`Failed to create exercise: ${trimmed}`)
  return newEx.id
}

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
      parent_cycle_id: sourceCycleId, // mark this as a client copy of the source
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
  const [viewMode, setViewMode] = useState<'tile' | 'list'>(() => {
    if (typeof window === 'undefined') return 'tile'
    return (localStorage.getItem('programs_view_mode') as 'tile' | 'list') ?? 'tile'
  })
  const [programs, setPrograms] = useState<Program[]>([])
  const [activeAssignments, setActiveAssignments] = useState<ActiveAssignment[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')

  function setViewModeAndPersist(mode: 'tile' | 'list') {
    setViewMode(mode)
    if (typeof window !== 'undefined') {
      localStorage.setItem('programs_view_mode', mode)
    }
  }

  // Assign modal state
  const [assignProgram, setAssignProgram] = useState<Program | null>(null)
  const [assignClientId, setAssignClientId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState('')
  const [assignSuccess, setAssignSuccess] = useState('')

  // Delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Import from document
  type ImportStep = 'upload' | 'extracting' | 'parsing' | 'review' | 'saving'
  const [importStep, setImportStep] = useState<ImportStep | null>(null)
  const [importError, setImportError] = useState('')
  const [parsedData, setParsedData] = useState<ParsedProgram | null>(null)
  const [importName, setImportName] = useState('')
  const importFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    // Library list = cycles with no parent_cycle_id (originals only, not client copies).
    // Active assignments query: client_cycle_assignments has no trainer_id column,
    // so we filter via clients!inner(trainer_id) instead.
    const [programsRes, assignRes, clientsRes] = await Promise.all([
      supabase
        .from('training_cycles')
        .select('id, name, description, cover_photo_url, num_days, num_weeks, tags, created_at')
        .eq('trainer_id', profile?.id)
        .is('parent_cycle_id', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('client_cycle_assignments')
        .select('id, cycle_id, next_day_number, started_at, clients!inner(full_name, trainer_id), training_cycles(name, num_days, num_weeks, cover_photo_url, tags)')
        .eq('clients.trainer_id', profile?.id)
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

    // Deactivate any existing active assignment for this client.
    // IMPORTANT: we only set { is_active: false } here — the deployed
    // client_cycle_assignments table does NOT have a `status` column (see
    // the fetchAll() comment above), and including a nonexistent column in
    // the UPDATE makes PostgREST return a 400 error. We also explicitly
    // check for that error so a future schema drift can't silently leave
    // the old assignment active and cause the "two active programs" bug
    // we just cleaned up (see supabase/migrations/fix_stale_client_assignments.sql).
    const { error: deactivateErr } = await supabase
      .from('client_cycle_assignments')
      .update({ is_active: false })
      .eq('client_id', assignClientId)
      .eq('is_active', true)

    if (deactivateErr) {
      setAssignError(`Could not deactivate previous program: ${deactivateErr.message}`)
      setAssigning(false)
      return
    }

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

  // ── Import from Document ──────────────────────────────────────────────────

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (importFileRef.current) importFileRef.current.value = ''

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    setImportError('')
    setImportStep('extracting')

    try {
      let documentText = ''

      if (ext === 'docx' || ext === 'doc') {
        const arrayBuffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        documentText = result.value
      } else if (ext === 'txt' || ext === 'csv') {
        documentText = await file.text()
      } else if (ext === 'pdf') {
        setImportError('PDF text extraction is not supported in the browser. Please export your program as a .docx or .txt file and try again.')
        setImportStep('upload')
        return
      } else {
        // Attempt plain text read for other types
        documentText = await file.text()
      }

      if (!documentText.trim()) {
        setImportError('Could not extract text from this file. Please try a .docx or .txt version.')
        setImportStep('upload')
        return
      }

      setImportStep('parsing')

      const apiRes = await fetch('/api/parse-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentText, documentName: file.name }),
      })

      if (!apiRes.ok) {
        const errBody = await apiRes.json().catch(() => ({}))
        setImportError((errBody as any).error ?? `Parse error: ${apiRes.status}`)
        setImportStep('upload')
        return
      }

      const parsed: ParsedProgram = await apiRes.json()
      setParsedData(parsed)
      setImportName(parsed.program_name || file.name.replace(/\.[^.]+$/, ''))
      setImportStep('review')
    } catch (err: any) {
      setImportError(err.message ?? 'Unexpected error during import')
      setImportStep('upload')
    }
  }

  async function saveImportedProgram() {
    if (!parsedData || !profile?.id) return
    setImportStep('saving')
    setImportError('')

    try {
      const trainerId = profile.id

      // 1. Create training_cycle
      const { data: cycle } = await supabase
        .from('training_cycles')
        .insert({
          trainer_id: trainerId,
          name: importName.trim() || parsedData.program_name,
          description: null,
          cover_photo_url: null,
          num_days: parsedData.days.length,
          num_weeks: parsedData.weeks || 4,
          is_template: false,
          tags: [],
        })
        .select('id')
        .single()

      if (!cycle) throw new Error('Failed to create training cycle')

      // 2. Save each day + exercises
      for (const day of parsedData.days) {
        const isRestDay = day.exercises.length === 0

        const { data: workout } = await supabase
          .from('workouts')
          .insert({
            cycle_id: cycle.id,
            day_number: day.day_number,
            name: day.day_name || `Day ${day.day_number}`,
            focus: isRestDay ? 'rest_day' : (day.focus || null),
          })
          .select('id')
          .single()

        if (!workout || isRestDay) continue

        let position = 0
        for (const ex of day.exercises) {
          // ALWAYS resolve to a real UUID — never skip, never null
          const exerciseId = await resolveOrCreateExercise(ex.name, trainerId)

          const { data: we } = await supabase
            .from('workout_exercises')
            .insert({
              workout_id: workout.id,
              exercise_id: exerciseId,
              position: position++,
              notes: ex.coaching_notes || null,
              superset_group: null,
              cue_override: null,
            })
            .select('id')
            .single()

          if (!we) continue

          if (ex.sets.length > 0) {
            await supabase.from('workout_set_prescriptions').insert(
              ex.sets.map(s => ({
                workout_exercise_id: we.id,
                set_number: s.set_number,
                set_type: normalizeSetType(s.set_type),
                reps: formatReps(s.reps_min, s.reps_max) || null,
                rpe_target: null,
                load_modifier: s.special_instructions || null,
                hold_seconds: null,
                tempo: null,
                cue: null,
              }))
            )
          }
        }
      }

      // Done — refresh library and close modal
      await fetchAll()
      setImportStep(null)
      setParsedData(null)
      setImportName('')
      setImportError('')
    } catch (err: any) {
      setImportError(err.message ?? 'Failed to save program')
      setImportStep('review')
    }
  }

  function closeImportModal() {
    setImportStep(null)
    setParsedData(null)
    setImportName('')
    setImportError('')
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
        <div className="absolute bottom-6 right-6 flex gap-2">
          <button
            onClick={() => { setImportStep('upload'); setImportError('') }}
            className="bg-white/10 backdrop-blur-sm text-white font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-white/20 border border-white/20 transition-colors"
          >
            Import from Doc
          </button>
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

      {/* Tabs + View toggle */}
      <div className="flex items-center justify-between mb-6 border-b border-[#2C2C2E]">
        <div className="flex gap-1">
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

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg p-0.5 mb-2">
          <button
            onClick={() => setViewModeAndPersist('tile')}
            title="Tile view"
            className={`flex items-center justify-center w-8 h-7 rounded-md transition-colors ${
              viewMode === 'tile' ? 'bg-[#C9A84C] text-black' : 'text-white/40 hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button
            onClick={() => setViewModeAndPersist('list')}
            title="List view"
            className={`flex items-center justify-center w-8 h-7 rounded-md transition-colors ${
              viewMode === 'list' ? 'bg-[#C9A84C] text-black' : 'text-white/40 hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <line x1="4" y1="6" x2="20" y2="6" strokeLinecap="round" />
              <line x1="4" y1="12" x2="20" y2="12" strokeLinecap="round" />
              <line x1="4" y1="18" x2="20" y2="18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
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
        ) : viewMode === 'tile' ? (
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
        ) : (
          /* List view */
          <div className="flex flex-col gap-2">
            {filteredLibrary.map(program => (
              <div
                key={program.id}
                className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-5 py-4 flex items-center gap-4 hover:border-[#3A3A3C] transition-colors group"
              >
                <div
                  onClick={() => navigate(`/trainer/programs/${program.id}`)}
                  className="flex-1 min-w-0 cursor-pointer"
                >
                  <h3 className="font-bebas text-lg text-white tracking-wide hover:text-[#C9A84C] transition-colors">
                    {program.name}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="font-barlow text-xs text-white/40">{program.num_days}d/wk · {program.num_weeks}wk</span>
                    {(program.tags ?? []).length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {(program.tags ?? []).map(tag => (
                          <span key={tag} className="font-barlow text-xs px-2 py-0.5 rounded-full bg-[#C9A84C]/10 text-[#C9A84C]/70 border border-[#C9A84C]/20">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setAssignProgram(program)
                    setAssignClientId('')
                    setAssignError('')
                    setAssignSuccess('')
                  }}
                  className="font-barlow text-xs text-[#C9A84C] border border-[#C9A84C]/30 rounded-lg px-3 py-1.5 hover:bg-[#C9A84C]/10 transition-colors flex-shrink-0"
                >
                  Assign
                </button>
                <button
                  onClick={() => setConfirmDeleteId(program.id)}
                  className="text-white/30 hover:text-[#E05555] transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))}

            {/* New program row */}
            <div
              onClick={() => navigate('/trainer/programs/new')}
              className="bg-[#141414] border border-dashed border-[#2C2C2E] rounded-xl px-5 py-4 flex items-center justify-center gap-2 cursor-pointer hover:border-[#C9A84C] transition-colors"
            >
              <span className="font-bebas text-sm text-white/30 tracking-widest">+ New Program</span>
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
        ) : viewMode === 'tile' ? (
          <div className="grid grid-cols-3 gap-4">
            {filteredActive.map((a, i) => {
              const currentWeek = Math.ceil(a.next_day_number / Math.max(a.num_days, 1))
              const pct = Math.min(100, Math.round(((a.next_day_number - 1) / Math.max(a.num_days * a.num_weeks, 1)) * 100))
              return (
                <div key={a.id} className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] overflow-hidden hover:border-[#3A3A3C] transition-colors">
                  <div
                    className="h-32 bg-cover bg-center relative"
                    style={{ backgroundImage: `url(${getCover(a.cover_photo_url, i)})` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1C1C1E] via-[#1C1C1E]/30 to-transparent" />
                  </div>
                  <div className="p-4">
                    <p className="font-bebas text-lg text-white tracking-wide truncate">{a.program_name}</p>
                    <p className="font-barlow text-xs text-[#C9A84C] mt-0.5">{a.client_name}</p>
                    <p className="font-barlow text-xs text-white/40 mt-1">Week {currentWeek} of {a.num_weeks} · {a.num_days}d/wk</p>
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
        ) : (
          /* List view */
          <div className="flex flex-col gap-2">
            {filteredActive.map(a => {
              const currentWeek = Math.ceil(a.next_day_number / Math.max(a.num_days, 1))
              const pct = Math.min(100, Math.round(((a.next_day_number - 1) / Math.max(a.num_days * a.num_weeks, 1)) * 100))
              return (
                <div key={a.id} className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-5 py-4 hover:border-[#3A3A3C] transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
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

      {/* ── Import from Document Modal ── */}
      {importStep !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-lg max-h-[85vh] flex flex-col">

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[#2C2C2E] flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="font-bebas text-2xl text-white tracking-wide">Import from Document</h2>
                <p className="font-barlow text-xs text-white/30 mt-0.5">
                  {importStep === 'upload' && 'Upload a .docx or .txt training program file'}
                  {importStep === 'extracting' && 'Reading document...'}
                  {importStep === 'parsing' && 'Analyzing with AI...'}
                  {importStep === 'review' && 'Review before saving to library'}
                  {importStep === 'saving' && 'Saving to library...'}
                </p>
              </div>
              {importStep !== 'extracting' && importStep !== 'parsing' && importStep !== 'saving' && (
                <button onClick={closeImportModal} className="text-white/30 hover:text-white text-xl leading-none ml-4">×</button>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* Error banner */}
              {importError && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
                  <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="font-barlow text-sm text-red-400">{importError}</p>
                </div>
              )}

              {/* Upload step */}
              {importStep === 'upload' && (
                <div>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".docx,.doc,.txt,.csv"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                  <button
                    onClick={() => importFileRef.current?.click()}
                    className="w-full border-2 border-dashed border-[#3A3A3C] hover:border-[#C9A84C]/50 rounded-2xl p-10 flex flex-col items-center gap-3 transition-colors group"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-[#C9A84C]/10 group-hover:bg-[#C9A84C]/15 flex items-center justify-center transition-colors">
                      <svg className="w-7 h-7 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="font-barlow text-sm font-semibold text-white">Click to choose a file</p>
                      <p className="font-barlow text-xs text-white/30 mt-1">Supports .docx and .txt</p>
                    </div>
                  </button>

                  <div className="mt-5 bg-[#141414] rounded-xl border border-[#2C2C2E] p-4">
                    <p className="font-barlow text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">How it works</p>
                    <div className="flex flex-col gap-2">
                      {['Upload your training document (.docx or .txt)', 'AI reads it and extracts exercises, sets, and rep ranges', 'Review the result, then save it to your program library'].map((step, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <span className="w-5 h-5 rounded-full bg-[#C9A84C]/15 text-[#C9A84C] font-bebas text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                          <p className="font-barlow text-xs text-white/40">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Loading steps */}
              {(importStep === 'extracting' || importStep === 'parsing' || importStep === 'saving') && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-10 h-10 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
                  <p className="font-barlow text-sm text-white/40">
                    {importStep === 'extracting' && 'Reading document text...'}
                    {importStep === 'parsing' && 'AI is analyzing the program structure...'}
                    {importStep === 'saving' && 'Saving exercises and workouts...'}
                  </p>
                </div>
              )}

              {/* Review step */}
              {importStep === 'review' && parsedData && (
                <div className="flex flex-col gap-5">
                  {/* Editable program name */}
                  <div>
                    <label className="font-barlow text-xs text-white/40 uppercase tracking-wider block mb-1.5">Program Name</label>
                    <input
                      type="text"
                      value={importName}
                      onChange={e => setImportName(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2E] focus:border-[#C9A84C]/50 rounded-xl px-4 py-3 font-barlow text-sm text-white placeholder-white/20 outline-none transition-colors"
                      placeholder="Program name..."
                    />
                  </div>

                  {/* Stats strip */}
                  <div className="flex gap-3">
                    {[
                      { label: 'Days', value: parsedData.days.length },
                      { label: 'Weeks', value: parsedData.weeks || 4 },
                      { label: 'Exercises', value: parsedData.days.reduce((sum, d) => sum + d.exercises.length, 0) },
                    ].map(stat => (
                      <div key={stat.label} className="flex-1 bg-[#141414] border border-[#2C2C2E] rounded-xl px-3 py-3 text-center">
                        <p className="font-bebas text-2xl text-[#C9A84C]">{stat.value}</p>
                        <p className="font-barlow text-xs text-white/30">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Day breakdown */}
                  <div className="flex flex-col gap-2">
                    <p className="font-barlow text-xs text-white/40 uppercase tracking-wider">Days Preview</p>
                    {parsedData.days.map(day => (
                      <div key={day.day_number} className="bg-[#141414] border border-[#2C2C2E] rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#C9A84C]/15 text-[#C9A84C] font-bebas text-xs flex items-center justify-center">{day.day_number}</span>
                            <span className="font-barlow text-sm font-semibold text-white">{day.day_name}</span>
                          </div>
                          {day.exercises.length > 0 ? (
                            <span className="font-barlow text-xs text-white/30">{day.exercises.length} exercises</span>
                          ) : (
                            <span className="font-barlow text-xs text-white/20 italic">Rest day</span>
                          )}
                        </div>
                        {day.exercises.length > 0 && (
                          <div className="flex flex-col gap-1 pl-8">
                            {day.exercises.slice(0, 4).map((ex, i) => (
                              <p key={i} className="font-barlow text-xs text-white/40 truncate">{ex.name}</p>
                            ))}
                            {day.exercises.length > 4 && (
                              <p className="font-barlow text-xs text-white/20">+ {day.exercises.length - 4} more</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {importStep === 'review' && (
              <div className="px-6 pb-6 pt-4 border-t border-[#2C2C2E] flex gap-3 flex-shrink-0">
                <button
                  onClick={closeImportModal}
                  className="flex-1 py-3 font-barlow text-sm text-white/50 hover:text-white border border-[#2C2C2E] rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveImportedProgram}
                  disabled={!importName.trim()}
                  className="flex-1 py-3 bg-[#C9A84C] text-black font-bebas text-base tracking-widest rounded-xl hover:bg-[#E2C070] transition-colors disabled:opacity-40"
                >
                  Save to Library
                </button>
              </div>
            )}
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
