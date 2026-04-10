import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import ExercisePicker from '../../components/ExercisePicker'
import SessionSummary from '../../components/SessionSummary'
import DarkSelect from '../../components/DarkSelect'
import { useUnsavedWarning } from '../../hooks/useUnsavedWarning'
import { useNavigationGuard } from '../../hooks/useNavigationGuard'

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
  session_context: string
  exercise_swaps: SwapEntry[]
  notes: string | null
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
  primary_muscle: string
  order_index: number
  superset_group: string | null
  skipped: boolean
  skip_note: string
  sets: SetRow[]
}

interface SetRow {
  session_set_id: string
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

export default function ClientSession() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<SessionData | null>(null)
  const [dayName, setDayName] = useState('')
  const [exercises, setExercises] = useState<ExerciseCard[]>([])
  const [loading, setLoading] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [prs, setPrs] = useState<PR[]>([])

  // Swap state
  const [swapForIndex, setSwapForIndex] = useState<number | null>(null)
  const [showFullLibrary, setShowFullLibrary] = useState(false)
  const [alternatives, setAlternatives] = useState<{ id: string; name: string }[]>([])

  // Skip state
  const [skipForIndex, setSkipForIndex] = useState<number | null>(null)
  const [skipNote, setSkipNote] = useState('')

  // Cancel-session confirm
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Set when the workout template has zero exercises (typically because the
  // program was vault-imported into a state with no workout_exercises rows,
  // OR an old program had its rows wiped by fix_workout_exercise_null_ids.sql).
  // Shown to the client as a friendly empty-state instead of a blank page.
  const [emptyWorkout, setEmptyWorkout] = useState(false)

  // Rest timer
  const [restTimer, setRestTimer] = useState<number | null>(null)
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Session timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<string>('')

  useUnsavedWarning(!completed && exercises.length > 0)
  useNavigationGuard(
    !completed && exercises.length > 0,
    'You have an active session in progress. Your logged sets are saved, but any unlogged sets will be lost if you leave now.'
  )

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

    if (sessionData.workout_id) {
      const { data: workout } = await supabase
        .from('workouts')
        .select('name')
        .eq('id', sessionData.workout_id)
        .single()
      setDayName(workout?.name ?? 'Training')
    }

    if (sessionData.status === 'completed') {
      // Load exercise data for summary display
      const { data: existing } = await supabase
        .from('session_exercises')
        .select('id, exercise_id, order_index, superset_group, skipped, skip_note, exercises(name, primary_muscle)')
        .eq('session_id', sessionId)
        .order('order_index')
      if (existing && existing.length > 0) {
        await buildCards(existing as any[])
      }
      setCompleted(true)
      setLoading(false)
      return
    }

    // Load or seed exercises for active session
    const { data: existing } = await supabase
      .from('session_exercises')
      .select('id, exercise_id, order_index, superset_group, skipped, skip_note, exercises(name, primary_muscle)')
      .eq('session_id', sessionId)
      .order('order_index')

    if (existing && existing.length > 0) {
      await buildCards(existing as any[])
    } else if (sessionData.workout_id) {
      await seedFromWorkout(sessionData.workout_id, sessionId)
    }

    setLoading(false)
  }, [sessionId])

  async function seedFromWorkout(workoutId: string, sessId: string) {
    const { data: wExercises } = await supabase
      .from('workout_exercises')
      .select('id, exercise_id, position, superset_group, exercises(name, primary_muscle), workout_set_prescriptions(id, set_number, set_type, reps, rpe_target)')
      .eq('workout_id', workoutId)
      .order('position')

    if (!wExercises || wExercises.length === 0) {
      // The workout template itself has no exercises. This usually means
      // either (a) the trainer assigned a vault-imported program whose
      // workout_exercises rows were never written, or (b) the rows existed
      // but had null exercise_id and were wiped by fix_workout_exercise_null_ids.sql.
      // Either way, there's nothing to seed and the client should see a
      // helpful message instead of a blank screen.
      setEmptyWorkout(true)
      return
    }

    // CRITICAL: filter out any workout_exercises rows that have a null
    // exercise_id. session_exercises.exercise_id is NOT NULL, so trying to
    // insert one with a null FK throws a 400 and silently breaks the entire
    // session seed (every subsequent insert in the loop also fails). This
    // happens when the trainer's underlying `exercises` rows were deleted
    // and the FK was nulled by `ON DELETE SET NULL`.
    const validExercises = wExercises.filter((we: any) => !!we.exercise_id)
    const skippedCount = wExercises.length - validExercises.length
    if (skippedCount > 0) {
      console.warn(
        `[Session] Skipped ${skippedCount} workout_exercises with null exercise_id ` +
        `for workout ${workoutId}. The trainer needs to re-add these in the program builder.`
      )
    }
    if (validExercises.length === 0) {
      setEmptyWorkout(true)
      return
    }

    const cards: ExerciseCard[] = []

    // Fallback name lookup for any rows where the embedded join didn't return
    // an exercise (RLS edge case for trainer-custom exercises).
    const missingIds = validExercises
      .filter((we: any) => !we.exercises?.name && we.exercise_id)
      .map((we: any) => we.exercise_id as string)
    let nameById = new Map<string, { name: string; primary_muscle: string }>()
    if (missingIds.length > 0) {
      const { data: exRows } = await supabase
        .from('exercises')
        .select('id, name, primary_muscle')
        .in('id', missingIds)
      nameById = new Map((exRows ?? []).map((e: any) => [e.id, { name: e.name, primary_muscle: e.primary_muscle ?? '' }]))
    }

    for (const we of validExercises) {
      const { data: se } = await supabase
        .from('session_exercises')
        .insert({ session_id: sessId, exercise_id: we.exercise_id, workout_exercise_id: we.id, order_index: we.position, superset_group: (we as any).superset_group ?? null })
        .select('id')
        .single()
      if (!se) continue

      const prescriptions = [...((we as any).workout_set_prescriptions ?? [])].sort((a: any, b: any) => a.set_number - b.set_number)
      const sets: SetRow[] = []
      let setCounter = 1
      for (const p of prescriptions) {
        const pType = p.set_type ?? 'working'
        if (pType === 'drop') {
          // A "drop" prescription means working set + drop set combo.
          // Expand into two rows so the session mirrors the program view.
          const { data: wss } = await supabase
            .from('session_sets')
            .insert({
              session_exercise_id: se.id,
              prescribed_set_id: p.id,
              set_number: setCounter,
              set_type: 'working',
              prescribed_reps: p.reps ?? '',
            })
            .select('id')
            .single()
          sets.push({
            session_set_id: wss?.id ?? '',
            set_number: setCounter,
            set_type: 'working',
            prescribed_reps: p.reps ?? '',
            rpe_target: p.rpe_target,
            weight: '', reps_done: '', rpe_felt: null, logged: false,
          })
          setCounter++
          const { data: dss } = await supabase
            .from('session_sets')
            .insert({
              session_exercise_id: se.id,
              prescribed_set_id: p.id,
              set_number: setCounter,
              set_type: 'drop',
              prescribed_reps: p.reps ?? '',
            })
            .select('id')
            .single()
          sets.push({
            session_set_id: dss?.id ?? '',
            set_number: setCounter,
            set_type: 'drop',
            prescribed_reps: p.reps ?? '',
            rpe_target: p.rpe_target,
            weight: '', reps_done: '', rpe_felt: null, logged: false,
          })
          setCounter++
        } else {
          const { data: ss } = await supabase
            .from('session_sets')
            .insert({
              session_exercise_id: se.id,
              prescribed_set_id: p.id,
              set_number: setCounter,
              set_type: pType,
              prescribed_reps: p.reps ?? '',
            })
            .select('id')
            .single()
          sets.push({
            session_set_id: ss?.id ?? '',
            set_number: setCounter,
            set_type: pType,
            prescribed_reps: p.reps ?? '',
            rpe_target: p.rpe_target,
            weight: '', reps_done: '', rpe_felt: null, logged: false,
          })
          setCounter++
        }
      }

      const joinName = (we as any).exercises?.name as string | undefined
      const joinMuscle = (we as any).exercises?.primary_muscle as string | undefined
      const fallback = we.exercise_id ? nameById.get(we.exercise_id) : undefined
      cards.push({
        session_exercise_id: se.id,
        exercise_id: we.exercise_id,
        exercise_name: joinName || fallback?.name || 'Exercise',
        primary_muscle: joinMuscle || fallback?.primary_muscle || '',
        order_index: we.position,
        superset_group: (we as any).superset_group ?? null,
        skipped: false, skip_note: '',
        sets,
      })
    }
    setExercises(cards)
  }

  async function buildCards(sesExercises: any[]) {
    const cards: ExerciseCard[] = []

    // Fallback name lookup for session_exercises whose embedded join missed.
    const missingIds = sesExercises
      .filter((se: any) => !se.exercises?.name && se.exercise_id)
      .map((se: any) => se.exercise_id as string)
    let nameById = new Map<string, { name: string; primary_muscle: string }>()
    if (missingIds.length > 0) {
      const { data: exRows } = await supabase
        .from('exercises')
        .select('id, name, primary_muscle')
        .in('id', missingIds)
      nameById = new Map((exRows ?? []).map((e: any) => [e.id, { name: e.name, primary_muscle: e.primary_muscle ?? '' }]))
    }

    for (const se of sesExercises) {
      const { data: setsData } = await supabase
        .from('session_sets')
        .select('id, set_number, set_type, prescribed_reps, reps_completed, weight_kg, rpe_actual, workout_set_prescriptions(rpe_target)')
        .eq('session_exercise_id', se.id)
        .order('set_number')

      const sets: SetRow[] = (setsData ?? []).map((s: any) => ({
        session_set_id: s.id,
        set_number: s.set_number,
        set_type: s.set_type ?? 'working',
        prescribed_reps: s.prescribed_reps ?? '',
        rpe_target: s.workout_set_prescriptions?.rpe_target ?? null,
        weight: s.weight_kg != null ? String(s.weight_kg) : '',
        reps_done: s.reps_completed != null ? String(s.reps_completed) : '',
        rpe_felt: s.rpe_actual,
        logged: s.weight_kg != null && s.reps_completed != null,
      }))

      const joinName = se.exercises?.name as string | undefined
      const joinMuscle = se.exercises?.primary_muscle as string | undefined
      const fallback = se.exercise_id ? nameById.get(se.exercise_id) : undefined
      cards.push({
        session_exercise_id: se.id,
        exercise_id: se.exercise_id,
        exercise_name: joinName || fallback?.name || 'Exercise',
        primary_muscle: joinMuscle || fallback?.primary_muscle || '',
        order_index: se.order_index,
        superset_group: se.superset_group ?? null,
        skipped: se.skipped ?? false,
        skip_note: se.skip_note ?? '',
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
    if (restTimer === null) { if (restRef.current) clearInterval(restRef.current); return }
    if (restTimer <= 0) { setRestTimer(null); return }
    restRef.current = setInterval(() => {
      setRestTimer(prev => (prev !== null && prev > 0) ? prev - 1 : null)
    }, 1000)
    return () => { if (restRef.current) clearInterval(restRef.current) }
  }, [restTimer !== null])

  function updateSet(exIdx: number, setIdx: number, field: 'weight' | 'reps_done' | 'rpe_felt', value: string | number | null) {
    setExercises(prev => prev.map((ex, ei) =>
      ei !== exIdx ? ex : { ...ex, sets: ex.sets.map((s, si) => si !== setIdx ? s : { ...s, [field]: value }) }
    ))
  }

  async function changeSetType(exIdx: number, setIdx: number, newType: string) {
    const set = exercises[exIdx].sets[setIdx]
    await supabase.from('session_sets').update({ set_type: newType }).eq('id', set.session_set_id)
    setExercises(prev => prev.map((ex, ei) =>
      ei !== exIdx ? ex : { ...ex, sets: ex.sets.map((s, si) => si !== setIdx ? s : { ...s, set_type: newType }) }
    ))
  }

  // Auto-log a set. Pass overrides for any field whose state hasn't applied yet
  // (onChange fires before setState resolves, so read new values from overrides).
  async function autoLog(
    exIdx: number,
    setIdx: number,
    overrides: { weight?: string; reps_done?: string; rpe_felt?: number | null }
  ) {
    const set = exercises[exIdx].sets[setIdx]
    const weightStr = overrides.weight ?? set.weight
    const repsStr   = overrides.reps_done ?? set.reps_done
    const rpe       = 'rpe_felt' in overrides ? overrides.rpe_felt : set.rpe_felt

    const w = parseFloat(weightStr)
    const r = parseInt(repsStr)
    if (isNaN(w) || isNaN(r)) return

    await supabase
      .from('session_sets')
      .update({ weight_kg: w, reps_completed: r, rpe_actual: rpe ?? null })
      .eq('id', set.session_set_id)

    setExercises(prev => prev.map((ex, ei) =>
      ei !== exIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s, si) =>
          si !== setIdx ? s : { ...s, ...overrides, logged: true }
        ),
      }
    ))
    setRestTimer(90)
  }

  // Add an extra set to an exercise during the session
  async function addSet(exIdx: number) {
    const ex = exercises[exIdx]
    const lastSet = ex.sets[ex.sets.length - 1]
    const newSetNumber = (lastSet?.set_number ?? 0) + 1

    const { data: ss, error: insertErr } = await supabase
      .from('session_sets')
      .insert({ session_exercise_id: ex.session_exercise_id, set_number: newSetNumber })
      .select('id')
      .single()
    if (insertErr) { alert(`Add set failed: ${insertErr.message} (code: ${insertErr.code})`); return }
    if (!ss) { alert('Add set failed: no row returned'); return }

    const newSet: SetRow = {
      session_set_id: ss.id,
      set_number: newSetNumber,
      set_type: 'working',
      prescribed_reps: lastSet?.prescribed_reps ?? '',
      rpe_target: lastSet?.rpe_target ?? null,
      weight: lastSet?.weight ?? '',
      reps_done: '',
      rpe_felt: null,
      logged: false,
    }

    setExercises(prev => prev.map((e, ei) =>
      ei !== exIdx ? e : { ...e, sets: [...e.sets, newSet] }
    ))
  }

  // Log all sets for an exercise at once — no rest timer
  async function logAllSets(exIdx: number) {
    const ex = exercises[exIdx]
    const toLog = ex.sets.filter(s => !s.logged && s.weight !== '' && s.reps_done !== '' && !isNaN(parseFloat(s.weight)) && !isNaN(parseInt(s.reps_done)))
    if (toLog.length === 0) return

    await Promise.all(
      toLog.map(s =>
        supabase.from('session_sets').update({
          weight_kg: parseFloat(s.weight),
          reps_completed: parseInt(s.reps_done),
          rpe_actual: s.rpe_felt ?? null,
        }).eq('id', s.session_set_id)
      )
    )

    setExercises(prev => prev.map((e, ei) =>
      ei !== exIdx ? e : {
        ...e,
        sets: e.sets.map(s =>
          !s.logged && s.weight !== '' && s.reps_done !== '' && !isNaN(parseFloat(s.weight)) && !isNaN(parseInt(s.reps_done))
            ? { ...s, logged: true }
            : s
        ),
      }
    ))
  }

  // ── Swap ──
  async function openSwap(exIdx: number) {
    setSwapForIndex(exIdx)
    setShowFullLibrary(false)
    const muscle = exercises[exIdx].primary_muscle
    if (muscle) {
      const { data } = await supabase
        .from('exercises')
        .select('id, name')
        .eq('primary_muscle', muscle)
        .neq('id', exercises[exIdx].exercise_id)
        .limit(6)
      setAlternatives(data ?? [])
    } else {
      setAlternatives([])
    }
  }

  async function doSwap(exIdx: number, newEx: { id: string; name: string }) {
    const old = exercises[exIdx]
    const entry: SwapEntry = {
      original_exercise_id: old.exercise_id,
      original_exercise_name: old.exercise_name,
      replacement_exercise_id: newEx.id,
      replacement_exercise_name: newEx.name,
      swapped_at: new Date().toISOString(),
    }
    await supabase.from('session_exercises').update({ exercise_id: newEx.id }).eq('id', old.session_exercise_id)
    const swaps = session?.exercise_swaps ?? []
    await supabase.from('sessions').update({ exercise_swaps: [...swaps, entry] }).eq('id', sessionId!)
    setSession(prev => prev ? { ...prev, exercise_swaps: [...(prev.exercise_swaps ?? []), entry] } : prev)
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, exercise_id: newEx.id, exercise_name: newEx.name }))
    setSwapForIndex(null)
    setShowFullLibrary(false)
  }

  // ── Skip ──
  async function confirmSkip() {
    if (skipForIndex === null) return
    await supabase.from('session_exercises').update({ skipped: true, skip_note: skipNote || null }).eq('id', exercises[skipForIndex].session_exercise_id)
    setExercises(prev => prev.map((ex, i) => i !== skipForIndex ? ex : { ...ex, skipped: true, skip_note: skipNote }))
    setSkipForIndex(null)
    setSkipNote('')
  }

  // ── Cancel (abort in-progress session and delete it) ──
  async function cancelSession() {
    if (!sessionId || !session) return
    setCancelling(true)
    // Delete session_sets first (FK), then session_exercises, then the session itself.
    // Cascades may handle this, but we do it explicitly to be safe.
    const { data: ses } = await supabase
      .from('session_exercises')
      .select('id')
      .eq('session_id', sessionId)
    const seIds = (ses ?? []).map(r => r.id)
    if (seIds.length > 0) {
      await supabase.from('session_sets').delete().in('session_exercise_id', seIds)
      await supabase.from('session_exercises').delete().in('id', seIds)
    }
    await supabase.from('sessions').delete().eq('id', sessionId)
    setCancelling(false)
    setShowCancelConfirm(false)
    navigate('/client/home')
  }

  // ── Finish ──
  async function finishSession() {
    if (!sessionId || !session) return
    setFinishing(true)

    const now = new Date()
    const started = new Date(session.started_at)
    const durationMin = Math.round((now.getTime() - started.getTime()) / 60000)

    let totalTonnage = 0, rpeSum = 0, rpeCount = 0
    for (const ex of exercises) {
      if (ex.skipped) continue
      for (const s of ex.sets) {
        if (s.logged) {
          totalTonnage += (parseFloat(s.weight) || 0) * (parseInt(s.reps_done) || 0)
          if (s.rpe_felt !== null) { rpeSum += s.rpe_felt; rpeCount++ }
        }
      }
    }
    const avgRpe = rpeCount > 0 ? Math.round((rpeSum / rpeCount) * 10) / 10 : null

    await supabase.from('sessions').update({
      status: 'completed', completed_at: now.toISOString(),
      duration_min: durationMin, total_tonnage: Math.round(totalTonnage), average_rpe: avgRpe,
    }).eq('id', sessionId)

    // PR detection
    const detectedPRs: PR[] = []
    for (const ex of exercises) {
      if (ex.skipped) continue
      for (const s of ex.sets) {
        if (!s.logged) continue
        const w = parseFloat(s.weight) || 0
        const r = parseInt(s.reps_done) || 0
        if (w <= 0 && r <= 0) continue

        const { data: prev } = await supabase
          .from('session_sets')
          .select('weight_kg, reps_completed, session_exercises!inner(exercise_id, sessions!inner(client_id))')
          .eq('session_exercises.exercise_id', ex.exercise_id)
          .eq('session_exercises.sessions.client_id', session.client_id)
          .not('weight_kg', 'is', null)

        const maxW = Math.max(0, ...(prev ?? []).map((p: any) => p.weight_kg ?? 0))
        const maxR = Math.max(0, ...(prev ?? []).map((p: any) => p.reps_completed ?? 0))

        if (w > maxW) {
          detectedPRs.push({ exercise_name: ex.exercise_name, pr_type: 'weight', value: w })
          await supabase.from('personal_records').insert({ client_id: session.client_id, exercise_name: ex.exercise_name, pr_type: 'weight', value: w, logged_at: now.toISOString() })
        }
        if (r > maxR) {
          detectedPRs.push({ exercise_name: ex.exercise_name, pr_type: 'reps', value: r })
          await supabase.from('personal_records').insert({ client_id: session.client_id, exercise_name: ex.exercise_name, pr_type: 'reps', value: r, logged_at: now.toISOString() })
        }
        break
      }
    }

    setPrs(detectedPRs)
    setSession(prev => prev ? { ...prev, status: 'completed', completed_at: now.toISOString(), total_tonnage: Math.round(totalTonnage), average_rpe: avgRpe } : prev)
    setCompleted(true)
    setFinishing(false)
  }

  // ── Render ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    )
  }

  // Empty workout — the template has no exercises (vault import failure or
  // historical data wiped by the cleanup migration). Show a friendly state
  // and let the user back out to home, where they can pick a different day
  // or contact their trainer. The session is auto-deleted on bail so it
  // doesn't linger in the DB as an orphaned in_progress row.
  if (emptyWorkout) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-6">
        <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] w-full max-w-md p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#C9A84C]/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 5a7 7 0 110 14 7 7 0 010-14z" />
            </svg>
          </div>
          <h2 className="font-bebas text-2xl text-white tracking-wide mb-2">No exercises yet</h2>
          <p className="font-barlow text-sm text-white/60 mb-5">
            This workout day doesn't have any exercises set up. Your trainer needs to add them in the program builder before you can start the session.
          </p>
          <button
            onClick={async () => {
              if (sessionId) await supabase.from('sessions').delete().eq('id', sessionId)
              navigate('/client/home')
            }}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-6 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
          >
            Back to home
          </button>
        </div>
      </div>
    )
  }

  if (completed && session) {
    const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.logged).length, 0)
    const prescribedRpeAvg = (() => {
      let sum = 0, count = 0
      exercises.forEach(ex => ex.sets.forEach(s => { if (s.rpe_target) { sum += s.rpe_target; count++ } }))
      return count > 0 ? Math.round((sum / count) * 10) / 10 : null
    })()
    return (
      <div className="min-h-screen bg-[#0A0A0A] pb-24">
        <SessionSummary
          role="client"
          sessionId={session.id}
          durationMin={(session as any).duration_min ?? Math.round(elapsed / 60)}
          totalSets={totalSets}
          totalTonnage={session.total_tonnage ?? 0}
          averageRpe={session.average_rpe}
          prescribedRpeAvg={prescribedRpeAvg}
          prs={prs}
          onDone={() => navigate(-1)}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-20">
      <div className="w-full px-2 pt-2">

        {/* ── Header ── */}
        <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] px-3 py-2 mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-bebas text-lg text-white tracking-wide truncate leading-none">{dayName || 'Training'}</p>
            {session?.session_context === 'unscheduled' && (
              <p className="font-barlow text-[9px] text-white/30">Unscheduled</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="font-bebas text-lg text-[#C9A84C] tracking-widest tabular-nums">{formatTimer(elapsed)}</span>
            <button
              onClick={() => setShowCancelConfirm(true)}
              disabled={finishing || cancelling}
              className="font-barlow text-[10px] text-white/40 border border-white/10 rounded-md px-2 py-1 hover:text-white hover:border-white/30 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={finishSession}
              disabled={finishing || cancelling}
              className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-3 py-1 rounded-md hover:bg-[#E2C070] transition-colors disabled:opacity-50"
            >
              {finishing ? 'Saving...' : 'Finish'}
            </button>
          </div>
        </div>

        {/* ── Rest timer ── */}
        {restTimer !== null && (
          <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-lg px-3 py-1.5 mb-2 flex items-center justify-between">
            <p className="font-barlow text-xs text-[#C9A84C]">Rest</p>
            <div className="flex items-center gap-3">
              <span className="font-bebas text-lg text-[#C9A84C] tabular-nums">{formatTimer(restTimer)}</span>
              <button onClick={() => setRestTimer(null)} className="font-barlow text-xs text-white/30 hover:text-white">Skip</button>
            </div>
          </div>
        )}

        {/* ── Exercises ── */}
        {exercises.length === 0 && (
          <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-8 text-center mb-4">
            <p className="font-bebas text-xl text-white/40 tracking-wide mb-2">No exercises found</p>
            <p className="font-barlow text-sm text-white/30">
              This workout has no exercises programmed. Ask your trainer to add some, or finish the session if this looks wrong.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {(() => {
            const seen = new Set<string>()
            return exercises.flatMap((ex, exIdx) => {
              const group = ex.superset_group
              if (group && seen.has(group)) return []
              if (group) {
                seen.add(group)
                const groupIndices = exercises.reduce<number[]>((acc, e, i) => { if (e.superset_group === group) acc.push(i); return acc }, [])
                return [(
                  <div key={`ss-${group}`} className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#C9A84C]/40 rounded-full" />
                    <div className="pl-2.5">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="font-bebas text-[10px] text-[#C9A84C] bg-[#C9A84C]/10 border border-[#C9A84C]/20 px-1.5 py-0.5 rounded-full tracking-widest">SUPERSET {group}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {groupIndices.map(idx => renderClientCard(exercises[idx], idx))}
                      </div>
                    </div>
                  </div>
                )]
              }
              return [renderClientCard(ex, exIdx)]
            })
          })()}
        </div>
      </div>
      {/* ── Swap bottom sheet ── */}
      {swapForIndex !== null && !showFullLibrary && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center">
          <div className="bg-[#1C1C1E] rounded-t-2xl border-t border-[#2C2C2E] w-full max-w-[500px] max-h-[60vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#2C2C2E]">
              <h2 className="font-bebas text-lg text-white tracking-wide">Swap Exercise</h2>
              <button onClick={() => setSwapForIndex(null)} className="text-white/40 hover:text-white text-lg">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {alternatives.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="font-barlow text-xs text-white/30 uppercase tracking-wider mb-1">Suggested alternatives</p>
                  {alternatives.map(alt => (
                    <button key={alt.id} onClick={() => doSwap(swapForIndex, alt)} className="flex items-center gap-3 p-3 bg-[#2C2C2E] hover:bg-[#3A3A3C] rounded-xl text-left transition-colors">
                      <span className="font-barlow text-sm text-white flex-1">{alt.name}</span>
                      <span className="font-barlow text-xs text-[#C9A84C]">Select</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="font-barlow text-sm text-white/30 text-center py-4">No alternatives found for this muscle group.</p>
              )}
            </div>
            <div className="p-4 border-t border-[#2C2C2E]">
              <button onClick={() => setShowFullLibrary(true)} className="w-full font-barlow text-sm text-[#C9A84C] hover:text-[#E2C070] py-2 transition-colors">
                Search full library
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full library picker */}
      {swapForIndex !== null && showFullLibrary && (
        <ExercisePicker
          onSelect={(ex) => doSwap(swapForIndex, { id: ex.id, name: ex.name })}
          onClose={() => { setSwapForIndex(null); setShowFullLibrary(false) }}
        />
      )}

      {/* ── Skip modal ── */}
      {skipForIndex !== null && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] w-full max-w-sm p-5">
            <h2 className="font-bebas text-xl text-white tracking-wide mb-2">Skip {exercises[skipForIndex].exercise_name}?</h2>
            <textarea
              value={skipNote}
              onChange={e => setSkipNote(e.target.value)}
              placeholder="Optional note for Josh..."
              rows={2}
              className="w-full bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-3 py-2 font-barlow text-sm text-white placeholder-white/20 resize-none outline-none focus:border-[#C9A84C]/50 mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setSkipForIndex(null)} className="flex-1 font-barlow text-sm text-white/40 border border-[#2C2C2E] rounded-xl py-2.5 hover:text-white transition-colors">Cancel</button>
              <button onClick={confirmSkip} className="flex-1 bg-[#C9A84C] text-black font-bebas text-sm tracking-widest py-2.5 rounded-xl hover:bg-[#E2C070] transition-colors">Skip Exercise</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel session confirm ── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] w-full max-w-sm p-5">
            <h2 className="font-bebas text-xl text-white tracking-wide mb-2">Cancel session?</h2>
            <p className="font-barlow text-sm text-white/60 mb-5">
              This will discard everything you've logged so far and remove this session. You can start it again anytime from the home screen.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelling}
                className="flex-1 font-barlow text-sm text-white/60 border border-[#2C2C2E] rounded-xl py-2.5 hover:text-white transition-colors disabled:opacity-50"
              >
                Keep Going
              </button>
              <button
                onClick={cancelSession}
                disabled={cancelling}
                className="flex-1 bg-red-500/80 text-white font-bebas text-sm tracking-widest py-2.5 rounded-xl hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Discard Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function renderClientCard(ex: ExerciseCard, exIdx: number) {
    return (
      <div key={ex.session_exercise_id} className={`bg-white/[0.03] backdrop-blur-sm rounded-xl border px-2.5 py-2 ${ex.skipped ? 'border-[#2C2C2E] opacity-50' : 'border-[#2C2C2E]'}`}>
        {/* Exercise header */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="min-w-0 flex-1">
            <p className="font-bebas text-base text-white tracking-wide truncate leading-tight">{ex.exercise_name}</p>
            {ex.primary_muscle && (
              <span className="font-barlow text-[9px] text-white/30 uppercase tracking-wider">{ex.primary_muscle}</span>
            )}
          </div>
          <div className="flex items-center gap-1 ml-1 flex-shrink-0">
            {!ex.skipped && (
              <button
                onClick={() => openSwap(exIdx)}
                className="font-barlow text-[9px] text-white/30 border border-white/10 rounded px-1.5 py-0.5 hover:text-white/70 transition-colors"
              >
                Swap
              </button>
            )}
            {!ex.skipped && (
              <button
                onClick={() => setSkipForIndex(exIdx)}
                className="font-barlow text-[9px] text-white/30 border border-white/10 rounded px-1.5 py-0.5 hover:text-red-400 transition-colors"
              >
                Skip
              </button>
            )}
          </div>
        </div>

        {ex.skipped ? (
          <p className="font-barlow text-[10px] text-white/30 italic">{ex.skip_note || 'Skipped'}</p>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-[14px_34px_48px_1fr_1fr_1fr] gap-0.5 mb-1 px-0.5">
              <span />
              <span className="font-barlow text-[8px] text-white/25 text-center uppercase">Type</span>
              <span className="font-barlow text-[8px] text-white/25 text-center uppercase">Target</span>
              <span className="font-barlow text-[8px] text-white/25 text-center uppercase">Lbs</span>
              <span className="font-barlow text-[8px] text-white/25 text-center uppercase">Reps</span>
              <span className="font-barlow text-[8px] text-white/25 text-center uppercase">RPE</span>
            </div>

            {ex.sets.map((set, setIdx) => {
              const td = SET_TYPE_COLORS[set.set_type] ?? SET_TYPE_COLORS.working
              const isDrop = set.set_type === 'drop'
              return (
                <div key={set.session_set_id}>
                  {/* Drop connector */}
                  {isDrop && (
                    <div className="flex items-center gap-1 pl-5 mb-0.5">
                      <div className="w-px h-2.5 bg-orange-400/30" />
                      <span className="font-barlow text-[8px] text-orange-400/50 uppercase tracking-wider">drop</span>
                    </div>
                  )}
                  <div className={`grid grid-cols-[14px_34px_48px_1fr_1fr_1fr] gap-0.5 items-center mb-0.5 rounded transition-colors
                    ${isDrop ? 'pl-3 pr-0.5 py-0.5 border-l-2 border-orange-400/40' : 'px-0.5 py-0.5'}
                    ${set.logged ? 'bg-green-500/5 border border-green-500/20' : ''}`}>
                    <span className="font-barlow text-[9px] text-white/30 text-center">
                      {isDrop ? '↓' : set.set_number}
                    </span>
                    <DarkSelect
                      value={set.set_type}
                      onChange={v => changeSetType(exIdx, setIdx, v)}
                      options={Object.keys(SET_TYPE_COLORS).map(t => ({ value: t, label: t }))}
                      className="font-barlow text-[7px] font-semibold rounded capitalize leading-tight py-0.5 px-0.5"
                      style={{ backgroundColor: td.bg, color: td.text }}
                    />
                    <span className="font-barlow text-[9px] text-white/40 text-center leading-tight">
                      {set.prescribed_reps || '—'}
                      {set.rpe_target ? <span className="text-white/20">@{set.rpe_target}</span> : null}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={set.weight}
                      disabled={set.logged}
                      placeholder="lbs"
                      className="bg-[#1C1C1E] border border-[#2C2C2E] rounded px-0.5 py-1 text-white font-barlow text-[11px] text-center w-full focus:outline-none focus:border-[#C9A84C]/50 disabled:opacity-40 [color-scheme:dark]"
                      onChange={e => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={set.reps_done}
                      disabled={set.logged}
                      placeholder="reps"
                      className="bg-[#1C1C1E] border border-[#2C2C2E] rounded px-0.5 py-1 text-white font-barlow text-[11px] text-center w-full focus:outline-none focus:border-[#C9A84C]/50 disabled:opacity-40 [color-scheme:dark]"
                      onChange={e => updateSet(exIdx, setIdx, 'reps_done', e.target.value)}
                    />
                    <DarkSelect
                      value={set.rpe_felt !== null && set.rpe_felt !== undefined ? String(set.rpe_felt) : ''}
                      onChange={v => {
                        const rpeVal = v ? parseFloat(v) : null
                        if (set.logged) {
                          supabase.from('session_sets').update({ rpe_actual: rpeVal }).eq('id', set.session_set_id)
                          updateSet(exIdx, setIdx, 'rpe_felt', rpeVal)
                        } else if (rpeVal !== null && set.weight !== '' && set.reps_done !== '') {
                          autoLog(exIdx, setIdx, { rpe_felt: rpeVal })
                        } else {
                          updateSet(exIdx, setIdx, 'rpe_felt', rpeVal)
                        }
                      }}
                      options={[{ value: '', label: '—' }, ...RPE_VALUES.map(v => ({ value: String(v), label: String(v) }))]}
                      disabled={false}
                      className="bg-[#1C1C1E] border border-[#2C2C2E] rounded py-1 text-white font-barlow text-[11px] text-center"
                    />
                  </div>
                </div>
              )
            })}

            {/* Log all sets */}
            {ex.sets.some(s => !s.logged && s.weight !== '' && s.reps_done !== '') && (
              <button
                onClick={() => logAllSets(exIdx)}
                className="w-full mt-1.5 py-1.5 rounded border border-[#C9A84C]/40 font-barlow text-[11px] text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-colors"
              >
                ✓ Log All Sets
              </button>
            )}

            {/* Add extra set */}
            <button
              onClick={() => addSet(exIdx)}
              className="w-full mt-1 py-1 rounded font-barlow text-[10px] text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-colors"
            >
              + Add Set
            </button>
          </>
        )}
      </div>
    )
  }
}
