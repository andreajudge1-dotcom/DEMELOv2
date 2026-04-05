import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import ExercisePicker from '../../components/ExercisePicker'
import SessionSummary from '../../components/SessionSummary'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SessionData {
  id: string
  client_id: string
  trainer_id: string
  workout_id: string | null
  cycle_id: string | null
  started_at: string
  completed_at: string | null
  status: string
  exercise_swaps: SwapEntry[]
  notes: string | null
  coach_notes: string | null
  total_tonnage: number | null
  average_rpe: number | null
}

interface SwapEntry {
  original_exercise_id: string
  original_exercise_name: string
  replacement_exercise_id: string
  replacement_exercise_name: string
  swapped_at: string
}

interface ExerciseCard {
  session_exercise_id: string
  exercise_id: string
  exercise_name: string
  order_index: number
  sets: SetRow[]
}

interface SetRow {
  session_set_id: string
  prescribed_set_id: string | null
  set_number: number
  set_type: string
  prescribed_reps: string
  rpe_target: number | null
  weight: string
  reps_done: string
  rpe_felt: number | null
  logged: boolean
}

interface PR {
  exercise_name: string
  pr_type: 'weight' | 'reps'
  value: number
}

const SET_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  warmup:  { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa' },
  working: { bg: 'rgba(42,122,42,0.2)',    text: '#4ade80' },
  backoff: { bg: 'rgba(201,168,76,0.15)',  text: '#C9A84C' },
  drop:    { bg: 'rgba(249,115,22,0.15)',  text: '#fb923c' },
  myorep:  { bg: 'rgba(168,85,247,0.15)', text: '#c084fc' },
  amrap:   { bg: 'rgba(239,68,68,0.15)',  text: '#f87171' },
  tempo:   { bg: 'rgba(20,184,166,0.15)', text: '#2dd4bf' },
  pause:   { bg: 'rgba(236,72,153,0.15)', text: '#f472b6' },
}

const RPE_VALUES = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function TrainerSession() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionData | null>(null)
  const [clientName, setClientName] = useState('')
  const [dayName, setDayName] = useState('')
  const [programName, setProgramName] = useState('')
  const [exercises, setExercises] = useState<ExerciseCard[]>([])
  const [loading, setLoading] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [prs, setPrs] = useState<PR[]>([])

  // Swap modal
  const [swapForIndex, setSwapForIndex] = useState<number | null>(null)

  // Add exercise modal
  const [showAddExercise, setShowAddExercise] = useState(false)

  // Rest timer
  const [restTimer, setRestTimer] = useState<number | null>(null)
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Session timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<string>('')

  // ── Load session data ──
  const loadSession = useCallback(async () => {
    if (!sessionId) return

    const { data: sess } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (!sess) { setLoading(false); return }

    const sessionData = sess as unknown as SessionData
    setSession(sessionData)
    startedAtRef.current = sessionData.started_at

    // Load client name
    const { data: clientRow } = await supabase
      .from('clients')
      .select('full_name')
      .eq('id', sessionData.client_id)
      .single()
    setClientName(clientRow?.full_name ?? '')

    // Load workout + program info
    if (sessionData.workout_id) {
      const { data: workout } = await supabase
        .from('workouts')
        .select('name, cycle_id, training_cycles(name)')
        .eq('id', sessionData.workout_id)
        .single()
      if (workout) {
        setDayName(workout.name)
        setProgramName((workout as any).training_cycles?.name ?? '')
      }
    }

    if (sessionData.status === 'completed') {
      // Load exercise data for summary display
      const { data: existingExercises } = await supabase
        .from('session_exercises')
        .select('id, exercise_id, order_index, exercises(name)')
        .eq('session_id', sessionId)
        .order('order_index')
      if (existingExercises && existingExercises.length > 0) {
        await buildExerciseCards(existingExercises as any[])
      }
      setCompleted(true)
      setLoading(false)
      return
    }

    // Load or create session exercises for active session
    const { data: existingExercises } = await supabase
      .from('session_exercises')
      .select('id, exercise_id, order_index, exercises(name)')
      .eq('session_id', sessionId)
      .order('order_index')

    if (existingExercises && existingExercises.length > 0) {
      await buildExerciseCards(existingExercises as any[])
    } else if (sessionData.workout_id) {
      await seedFromWorkout(sessionData.workout_id, sessionId)
    }

    setLoading(false)
  }, [sessionId])

  async function seedFromWorkout(workoutId: string, sessId: string) {
    const { data: wExercises } = await supabase
      .from('workout_exercises')
      .select('id, exercise_id, position, exercises(name), workout_set_prescriptions(id, set_number, set_type, reps, rpe_target)')
      .eq('workout_id', workoutId)
      .order('position')

    if (!wExercises) return

    const cards: ExerciseCard[] = []

    for (const we of wExercises) {
      const { data: se } = await supabase
        .from('session_exercises')
        .insert({
          session_id: sessId,
          exercise_id: we.exercise_id,
          workout_exercise_id: we.id,
          order_index: we.position,
        })
        .select('id')
        .single()

      if (!se) continue

      const prescriptions = (we as any).workout_set_prescriptions ?? []
      const sortedPrescriptions = [...prescriptions].sort((a: any, b: any) => a.set_number - b.set_number)

      const sets: SetRow[] = []
      for (const p of sortedPrescriptions) {
        const { data: ss } = await supabase
          .from('session_sets')
          .insert({
            session_exercise_id: se.id,
            prescribed_set_id: p.id,
            set_number: p.set_number,
          })
          .select('id')
          .single()

        sets.push({
          session_set_id: ss?.id ?? '',
          prescribed_set_id: p.id,
          set_number: p.set_number,
          set_type: p.set_type ?? 'working',
          prescribed_reps: p.reps ?? '',
          rpe_target: p.rpe_target,
          weight: '',
          reps_done: '',
          rpe_felt: null,
          logged: false,
        })
      }

      cards.push({
        session_exercise_id: se.id,
        exercise_id: we.exercise_id,
        exercise_name: (we as any).exercises?.name ?? 'Exercise',
        order_index: we.position,
        sets,
      })
    }

    setExercises(cards)
  }

  async function buildExerciseCards(sesExercises: any[]) {
    const cards: ExerciseCard[] = []
    for (const se of sesExercises) {
      const { data: setsData } = await supabase
        .from('session_sets')
        .select('id, prescribed_set_id, set_number, reps_completed, weight_kg, rpe_actual, workout_set_prescriptions(set_type, reps, rpe_target)')
        .eq('session_exercise_id', se.id)
        .order('set_number')

      const sets: SetRow[] = (setsData ?? []).map((s: any) => ({
        session_set_id: s.id,
        prescribed_set_id: s.prescribed_set_id,
        set_number: s.set_number,
        set_type: s.workout_set_prescriptions?.set_type ?? 'working',
        prescribed_reps: s.workout_set_prescriptions?.reps ?? '',
        rpe_target: s.workout_set_prescriptions?.rpe_target ?? null,
        weight: s.weight_kg != null ? String(s.weight_kg) : '',
        reps_done: s.reps_completed != null ? String(s.reps_completed) : '',
        rpe_felt: s.rpe_actual,
        logged: s.weight_kg != null && s.reps_completed != null,
      }))

      cards.push({
        session_exercise_id: se.id,
        exercise_id: se.exercise_id,
        exercise_name: se.exercises?.name ?? 'Exercise',
        order_index: se.order_index,
        sets,
      })
    }
    setExercises(cards)
  }

  useEffect(() => { loadSession() }, [loadSession])

  // Session timer
  useEffect(() => {
    if (!startedAtRef.current || completed) return
    const start = new Date(startedAtRef.current).getTime()
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [loading, completed])

  // Rest timer
  useEffect(() => {
    if (restTimer === null) {
      if (restRef.current) clearInterval(restRef.current)
      return
    }
    if (restTimer <= 0) { setRestTimer(null); return }
    restRef.current = setInterval(() => {
      setRestTimer(prev => (prev !== null && prev > 0) ? prev - 1 : null)
    }, 1000)
    return () => { if (restRef.current) clearInterval(restRef.current) }
  }, [restTimer !== null])

  // ── Set input handlers ──
  function updateSet(exIdx: number, setIdx: number, field: 'weight' | 'reps_done' | 'rpe_felt', value: string | number | null) {
    setExercises(prev => prev.map((ex, ei) =>
      ei !== exIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s, si) =>
          si !== setIdx ? s : { ...s, [field]: value }
        ),
      }
    ))
  }

  async function logSet(exIdx: number, setIdx: number) {
    const ex = exercises[exIdx]
    const set = ex.sets[setIdx]
    const weightNum = parseFloat(set.weight)
    const repsNum = parseInt(set.reps_done)
    if (isNaN(weightNum) || isNaN(repsNum) || set.rpe_felt === null) return

    await supabase
      .from('session_sets')
      .update({
        weight_kg: weightNum,
        reps_completed: repsNum,
        rpe_actual: set.rpe_felt,
      })
      .eq('id', set.session_set_id)

    setExercises(prev => prev.map((ex, ei) =>
      ei !== exIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s, si) =>
          si !== setIdx ? s : { ...s, logged: true }
        ),
      }
    ))

    setRestTimer(90)
  }

  // ── Exercise swap ──
  async function handleSwap(exIdx: number, newExercise: { id: string; name: string }) {
    const old = exercises[exIdx]
    const swapEntry: SwapEntry = {
      original_exercise_id: old.exercise_id,
      original_exercise_name: old.exercise_name,
      replacement_exercise_id: newExercise.id,
      replacement_exercise_name: newExercise.name,
      swapped_at: new Date().toISOString(),
    }

    // Update session_exercises
    await supabase
      .from('session_exercises')
      .update({ exercise_id: newExercise.id })
      .eq('id', old.session_exercise_id)

    // Append to session exercise_swaps
    const currentSwaps = session?.exercise_swaps ?? []
    await supabase
      .from('sessions')
      .update({ exercise_swaps: [...currentSwaps, swapEntry] })
      .eq('id', sessionId!)

    setSession(prev => prev ? { ...prev, exercise_swaps: [...(prev.exercise_swaps ?? []), swapEntry] } : prev)
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex : { ...ex, exercise_id: newExercise.id, exercise_name: newExercise.name }
    ))
    setSwapForIndex(null)
  }

  // ── Add exercise ──
  async function handleAddExercise(exercise: { id: string; name: string }) {
    const nextOrder = exercises.length
    const { data: se } = await supabase
      .from('session_exercises')
      .insert({
        session_id: sessionId!,
        exercise_id: exercise.id,
        order_index: nextOrder,
      })
      .select('id')
      .single()

    if (!se) return

    // Create 3 default working sets
    const newSets: SetRow[] = []
    for (let i = 1; i <= 3; i++) {
      const { data: ss } = await supabase
        .from('session_sets')
        .insert({ session_exercise_id: se.id, set_number: i })
        .select('id')
        .single()
      newSets.push({
        session_set_id: ss?.id ?? '',
        prescribed_set_id: null,
        set_number: i,
        set_type: 'working',
        prescribed_reps: '',
        rpe_target: null,
        weight: '',
        reps_done: '',
        rpe_felt: null,
        logged: false,
      })
    }

    setExercises(prev => [...prev, {
      session_exercise_id: se.id,
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      order_index: nextOrder,
      sets: newSets,
    }])
    setShowAddExercise(false)
  }

  // ── Remove exercise ──
  async function handleRemoveExercise(exIdx: number) {
    const ex = exercises[exIdx]
    await supabase.from('session_exercises').delete().eq('id', ex.session_exercise_id)
    setExercises(prev => prev.filter((_, i) => i !== exIdx))
  }

  // ── Finish session ──
  async function finishSession() {
    if (!sessionId || !session) return
    setFinishing(true)

    const now = new Date()
    const started = new Date(session.started_at)
    const durationMin = Math.round((now.getTime() - started.getTime()) / 60000)

    // Calculate totals from local state
    let totalTonnage = 0
    let rpeSum = 0
    let rpeCount = 0

    for (const ex of exercises) {
      for (const s of ex.sets) {
        if (s.logged) {
          const w = parseFloat(s.weight) || 0
          const r = parseInt(s.reps_done) || 0
          totalTonnage += w * r
          if (s.rpe_felt !== null) {
            rpeSum += s.rpe_felt
            rpeCount++
          }
        }
      }
    }

    const avgRpe = rpeCount > 0 ? Math.round((rpeSum / rpeCount) * 10) / 10 : null

    await supabase
      .from('sessions')
      .update({
        status: 'completed',
        completed_at: now.toISOString(),
        duration_min: durationMin,
        total_tonnage: Math.round(totalTonnage),
        average_rpe: avgRpe,
      })
      .eq('id', sessionId)

    // PR detection
    const detectedPRs: PR[] = []
    for (const ex of exercises) {
      for (const s of ex.sets) {
        if (!s.logged) continue
        const w = parseFloat(s.weight) || 0
        const r = parseInt(s.reps_done) || 0
        if (w <= 0 && r <= 0) continue

        // Query historical bests for this exercise + client
        const { data: prev } = await supabase
          .from('session_sets')
          .select('weight_kg, reps_completed, session_exercises!inner(exercise_id, sessions!inner(client_id))')
          .eq('session_exercises.exercise_id', ex.exercise_id)
          .eq('session_exercises.sessions.client_id', session.client_id)
          .not('weight_kg', 'is', null)

        const prevWeights = (prev ?? []).map((p: any) => p.weight_kg ?? 0)
        const prevReps = (prev ?? []).map((p: any) => p.reps_completed ?? 0)
        const maxPrevWeight = prevWeights.length ? Math.max(...prevWeights) : 0
        const maxPrevReps = prevReps.length ? Math.max(...prevReps) : 0

        if (w > maxPrevWeight && w > 0) {
          detectedPRs.push({ exercise_name: ex.exercise_name, pr_type: 'weight', value: w })
          await supabase.from('personal_records').insert({
            client_id: session.client_id,
            exercise_name: ex.exercise_name,
            pr_type: 'weight',
            value: w,
            logged_at: now.toISOString(),
          })
        }
        if (r > maxPrevReps && r > 0) {
          detectedPRs.push({ exercise_name: ex.exercise_name, pr_type: 'reps', value: r })
          await supabase.from('personal_records').insert({
            client_id: session.client_id,
            exercise_name: ex.exercise_name,
            pr_type: 'reps',
            value: r,
            logged_at: now.toISOString(),
          })
        }
        break // Only check first logged set per exercise for PR
      }
    }

    setPrs(detectedPRs)
    setSession(prev => prev ? {
      ...prev,
      status: 'completed',
      completed_at: now.toISOString(),
      total_tonnage: Math.round(totalTonnage),
      average_rpe: avgRpe,
      duration_min: durationMin,
    } as any : prev)
    setCompleted(true)
    setFinishing(false)
  }

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-bebas text-xl text-[#C9A84C] tracking-widest">LOADING SESSION...</p>
      </div>
    )
  }

  if (completed && session) {
    const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.logged).length, 0)
    const prescribedRpeAvg = (() => {
      let sum = 0, count = 0
      exercises.forEach(ex => ex.sets.forEach(s => {
        if (s.rpe_target) { sum += s.rpe_target; count++ }
      }))
      return count > 0 ? Math.round((sum / count) * 10) / 10 : null
    })()

    return (
      <SessionSummary
        role="trainer"
        sessionId={session.id}
        durationMin={(session as any).duration_min ?? Math.round(elapsed / 60)}
        totalSets={totalSets}
        totalTonnage={session.total_tonnage ?? 0}
        averageRpe={session.average_rpe}
        prescribedRpeAvg={prescribedRpeAvg}
        prs={prs}
        onDone={() => navigate(-1)}
      />
    )
  }

  return (
    <div className="max-w-3xl pb-12">
      {/* ── Header ── */}
      <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bebas text-2xl text-white tracking-wide truncate">{clientName}</p>
          <p className="font-barlow text-sm text-white/40 truncate">
            {dayName}{programName ? ` · ${programName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="font-bebas text-2xl text-[#C9A84C] tracking-widest tabular-nums">
            {formatTimer(elapsed)}
          </div>
          <button
            onClick={finishSession}
            disabled={finishing}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors disabled:opacity-50"
          >
            {finishing ? 'Finishing...' : 'Finish Session'}
          </button>
        </div>
      </div>

      {/* ── Rest timer bar ── */}
      {restTimer !== null && (
        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
          <p className="font-barlow text-sm text-[#C9A84C]">Rest</p>
          <div className="flex items-center gap-3">
            <span className="font-bebas text-xl text-[#C9A84C] tabular-nums">{formatTimer(restTimer)}</span>
            <button onClick={() => setRestTimer(null)} className="font-barlow text-xs text-white/30 hover:text-white">Skip</button>
          </div>
        </div>
      )}

      {/* ── Exercises ── */}
      <div className="flex flex-col gap-4">
        {exercises.map((ex, exIdx) => (
          <div key={ex.session_exercise_id} className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-4">
            {/* Exercise header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bebas text-sm text-[#C9A84C] w-6 text-center flex-shrink-0">{exIdx + 1}</span>
                <span className="font-barlow text-sm font-semibold text-white truncate">{ex.exercise_name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setSwapForIndex(exIdx)}
                  className="font-barlow text-xs text-[#C9A84C] hover:text-[#E2C070] transition-colors"
                >
                  Swap
                </button>
                <button
                  onClick={() => handleRemoveExercise(exIdx)}
                  className="font-barlow text-xs text-red-400/50 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>

            {/* Sets */}
            {/* Header row */}
            <div className="grid grid-cols-[40px_60px_60px_50px_60px_60px_60px_70px] gap-1.5 px-1 mb-1.5">
              <span className="font-barlow text-[10px] text-white/25 uppercase">Set</span>
              <span className="font-barlow text-[10px] text-white/25 uppercase">Type</span>
              <span className="font-barlow text-[10px] text-white/25 uppercase">Rx Reps</span>
              <span className="font-barlow text-[10px] text-white/25 uppercase">RPE</span>
              <span className="font-barlow text-[10px] text-white/25 uppercase">Weight</span>
              <span className="font-barlow text-[10px] text-white/25 uppercase">Reps</span>
              <span className="font-barlow text-[10px] text-white/25 uppercase">RPE</span>
              <span />
            </div>

            {ex.sets.map((set, setIdx) => {
              const typeDef = SET_TYPE_COLORS[set.set_type] ?? SET_TYPE_COLORS.working
              const canLog = set.weight !== '' && set.reps_done !== '' && set.rpe_felt !== null
              return (
                <div
                  key={set.session_set_id}
                  className={`grid grid-cols-[40px_60px_60px_50px_60px_60px_60px_70px] gap-1.5 items-center mb-1.5 rounded-lg px-1 py-1.5 transition-colors ${
                    set.logged ? 'bg-green-500/5 border border-green-500/20' : ''
                  }`}
                >
                  <span className="font-barlow text-xs text-white/30 text-center">{set.set_number}</span>
                  <span
                    className="font-barlow text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-center capitalize"
                    style={{ backgroundColor: typeDef.bg, color: typeDef.text }}
                  >
                    {set.set_type}
                  </span>
                  <span className="font-barlow text-xs text-white/50 text-center">{set.prescribed_reps || '—'}</span>
                  <span className="font-barlow text-xs text-white/30 text-center">{set.rpe_target ?? '—'}</span>
                  <input
                    type="number"
                    value={set.weight}
                    onChange={e => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                    disabled={set.logged}
                    placeholder="lbs"
                    className="bg-[#0A0A0A] border border-[#2C2C2E] rounded px-1.5 py-1 text-white font-barlow text-xs text-center w-full focus:outline-none focus:border-[#C9A84C]/50 disabled:opacity-40"
                  />
                  <input
                    type="number"
                    value={set.reps_done}
                    onChange={e => updateSet(exIdx, setIdx, 'reps_done', e.target.value)}
                    disabled={set.logged}
                    placeholder="reps"
                    className="bg-[#0A0A0A] border border-[#2C2C2E] rounded px-1.5 py-1 text-white font-barlow text-xs text-center w-full focus:outline-none focus:border-[#C9A84C]/50 disabled:opacity-40"
                  />
                  {/* RPE selector */}
                  <div className="relative">
                    <select
                      value={set.rpe_felt ?? ''}
                      onChange={e => updateSet(exIdx, setIdx, 'rpe_felt', e.target.value ? parseFloat(e.target.value) : null)}
                      disabled={set.logged}
                      className="bg-[#0A0A0A] border border-[#2C2C2E] rounded px-1 py-1 text-white font-barlow text-xs text-center w-full focus:outline-none focus:border-[#C9A84C]/50 disabled:opacity-40 appearance-none"
                    >
                      <option value="">—</option>
                      {RPE_VALUES.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  {set.logged ? (
                    <div className="flex items-center justify-center">
                      <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    <button
                      onClick={() => logSet(exIdx, setIdx)}
                      disabled={!canLog}
                      className={`font-barlow text-[10px] font-semibold px-2 py-1 rounded transition-colors ${
                        canLog
                          ? 'bg-[#C9A84C] text-black hover:bg-[#E2C070]'
                          : 'bg-[#2C2C2E] text-white/20'
                      }`}
                    >
                      Log
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {/* Add Exercise */}
        <button
          onClick={() => setShowAddExercise(true)}
          className="border border-dashed border-[#2C2C2E] rounded-xl py-4 font-barlow text-sm text-white/30 hover:text-[#C9A84C] hover:border-[#C9A84C]/30 transition-colors"
        >
          + Add Exercise
        </button>
      </div>

      {/* ── Swap modal ── */}
      {swapForIndex !== null && (
        <ExercisePicker
          onSelect={(ex) => handleSwap(swapForIndex, { id: ex.id, name: ex.name })}
          onClose={() => setSwapForIndex(null)}
        />
      )}

      {/* ── Add exercise modal ── */}
      {showAddExercise && (
        <ExercisePicker
          onSelect={(ex) => handleAddExercise({ id: ex.id, name: ex.name })}
          onClose={() => setShowAddExercise(false)}
        />
      )}
    </div>
  )
}
