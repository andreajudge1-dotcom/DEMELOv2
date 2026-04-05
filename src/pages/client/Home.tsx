import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCheckIn } from '../../contexts/CheckInContext'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ClientData {
  id: string
  full_name: string
  trainer_id: string
}

interface TrainerData {
  full_name: string
}

interface ProgramData {
  id: string
  cycle_id: string
  next_day_number: number
  training_cycles: {
    name: string
    num_days: number
    num_weeks: number
  }
}

interface Workout {
  id: string
  day_number: number
  name: string
  focus: string | null
}

interface WorkoutExercise {
  id: string
  exercises: { name: string } | null
  workout_set_prescriptions: { rpe_target: number | null }[]
}

interface Session {
  id: string
  workout_id: string | null
  completed_at: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function getSundayOfWeek(date: Date): Date {
  const monday = getMondayOfWeek(date)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return sunday
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ClientHome() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { hasCheckedInThisWeek } = useCheckIn()

  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<ClientData | null>(null)
  const [trainer, setTrainer] = useState<TrainerData | null>(null)
  const [program, setProgram] = useState<ProgramData | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [todayExercises, setTodayExercises] = useState<WorkoutExercise[]>([])
  const [completedSessions, setCompletedSessions] = useState<Session[]>([])
  const [currentWeek, setCurrentWeek] = useState(1)
  const [startingSession, setStartingSession] = useState(false)
  const [dayExerciseNames, setDayExerciseNames] = useState<Record<string, string[]>>({})
  const [showDayPicker, setShowDayPicker] = useState(false)
  const [showExtraSheet, setShowExtraSheet] = useState(false)
  const [extraType, setExtraType] = useState<string | null>(null)
  const [extraDuration, setExtraDuration] = useState('')
  const [extraRpe, setExtraRpe] = useState('')
  const [extraNotes, setExtraNotes] = useState('')
  const [savingExtra, setSavingExtra] = useState(false)

  useEffect(() => {
    if (profile?.id) loadAll(profile.id)
  }, [profile])

  async function loadAll(userId: string) {
    setLoading(true)

    const { data: clientRow } = await supabase
      .from('clients')
      .select('id, full_name, trainer_id')
      .eq('profile_id', userId)
      .maybeSingle()

    if (!clientRow) { setLoading(false); return }
    setClient(clientRow)

    const { data: trainerRow } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', clientRow.trainer_id)
      .maybeSingle()
    setTrainer(trainerRow ?? null)

    const { data: assignRow } = await supabase
      .from('client_cycle_assignments')
      .select('id, cycle_id, next_day_number, training_cycles(name, num_days, num_weeks)')
      .eq('client_id', clientRow.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!assignRow || !(assignRow.training_cycles as any)?.name) { setLoading(false); return }
    setProgram(assignRow as unknown as ProgramData)

    const numDays = (assignRow.training_cycles as any)?.num_days ?? 4
    const week = Math.ceil(assignRow.next_day_number / numDays)
    setCurrentWeek(week)

    const { data: workoutRows } = await supabase
      .from('workouts')
      .select('id, day_number, name, focus')
      .eq('cycle_id', assignRow.cycle_id)
      .order('day_number')
    setWorkouts(workoutRows ?? [])

    // Exercise counts + names per workout
    if (workoutRows && workoutRows.length > 0) {
      const ids = workoutRows.map(w => w.id)
      const { data: weData } = await supabase
        .from('workout_exercises')
        .select('workout_id, exercises(name)')
        .in('workout_id', ids)
        .order('position')
      if (weData) {
        const names: Record<string, string[]> = {}
        weData.forEach((row: any) => {
          if (!names[row.workout_id]) names[row.workout_id] = []
          if (row.exercises?.name) names[row.workout_id].push(row.exercises.name)
        })
        setDayExerciseNames(names)
      }
    }

    // Sessions completed this week
    const monday = getMondayOfWeek(new Date())
    const sunday = getSundayOfWeek(new Date())
    const { data: sessionRows } = await supabase
      .from('sessions')
      .select('id, workout_id, completed_at')
      .eq('client_id', clientRow.id)
      .not('completed_at', 'is', null)
      .gte('completed_at', monday.toISOString())
      .lte('completed_at', sunday.toISOString())
    setCompletedSessions(sessionRows ?? [])

    // Determine suggested next day — first workout not completed this week
    const completedIds = new Set((sessionRows ?? []).map(s => s.workout_id))
    const suggestedWorkout = (workoutRows ?? []).find(w => !completedIds.has(w.id))
      ?? (workoutRows ?? []).find(w => w.day_number === assignRow.next_day_number)
      ?? (workoutRows ?? [])[0]

    if (suggestedWorkout) {
      const { data: exRows } = await supabase
        .from('workout_exercises')
        .select('id, exercises(name), workout_set_prescriptions(rpe_target)')
        .eq('workout_id', suggestedWorkout.id)
        .order('position')
      setTodayExercises((exRows ?? []) as unknown as WorkoutExercise[])
    }

    setLoading(false)
  }

  // ── Actions ──

  async function startSession(workoutOverride?: Workout) {
    if (!client || !program || startingSession) return
    setStartingSession(true)

    const completedIds = new Set(completedSessions.map(s => s.workout_id))
    const suggestedWorkout = workouts.find(w => !completedIds.has(w.id)) ?? workouts[0]
    const w = workoutOverride ?? suggestedWorkout ?? null

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        client_id: client.id,
        trainer_id: client.trainer_id,
        workout_id: w?.id ?? null,
        cycle_id: program.cycle_id,
        started_at: new Date().toISOString(),
        session_context: 'remote',
        initiated_by: 'client',
        counts_against_package: false,
        status: 'in_progress',
      })
      .select('id')
      .single()
    setStartingSession(false)
    if (data) navigate(`/client/session/${data.id}`)
    if (error) console.error('Start session error:', error)
  }

  async function saveExtraWorkout() {
    if (!client || !extraType) return
    setSavingExtra(true)
    const now = new Date()
    const dur = parseInt(extraDuration) || null
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        client_id: client.id,
        trainer_id: client.trainer_id,
        started_at: now.toISOString(),
        completed_at: now.toISOString(),
        duration_min: dur,
        session_context: 'unscheduled',
        initiated_by: 'client',
        counts_against_package: false,
        status: extraType === 'Strength' ? 'in_progress' : 'completed',
        notes: [extraType, extraNotes].filter(Boolean).join(' — '),
        average_rpe: extraRpe ? parseFloat(extraRpe) : null,
      })
      .select('id')
      .single()
    setSavingExtra(false)
    if (!data) { if (error) console.error(error); return }
    if (extraType === 'Strength') {
      navigate(`/client/session/${data.id}`)
    } else {
      setShowExtraSheet(false)
      setExtraType(null)
      loadAll(profile!.id)
    }
  }

  // ── Derived ──
  const firstName = client?.full_name?.split(' ')[0] ?? 'there'
  const trainerName = trainer?.full_name ?? 'Your coach'
  const trainerFirstName = trainerName.split(' ')[0]
  const trainerInitial = trainerName.charAt(0).toUpperCase()
  const numDays = (program?.training_cycles as any)?.num_days ?? 4
  const numWeeks = (program?.training_cycles as any)?.num_weeks ?? 4
  const programName = (program?.training_cycles as any)?.name ?? ''

  // Suggested workout = first not completed this week
  const completedIds = new Set(completedSessions.map(s => s.workout_id))
  const suggestedWorkout = workouts.find(w => !completedIds.has(w.id)) ?? workouts[0] ?? null
  const todayCompleted = suggestedWorkout ? completedIds.has(suggestedWorkout.id) : false
  const isRestDay = !suggestedWorkout

  // ─────────────────────────────────────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 1 — NO PROGRAM ASSIGNED
  // ─────────────────────────────────────────────────────────────────────────

  if (!program) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] pb-24">
        <div className="max-w-[390px] mx-auto px-5 pt-16 flex flex-col items-center text-center">
          <h1 className="font-bebas text-5xl text-white tracking-wide mb-3">
            {firstName}.
          </h1>
          <p className="font-barlow text-white/40 text-base leading-relaxed max-w-xs mb-10">
            Your coach is building your program. You will be notified when it is ready.
          </p>

          {/* Action cards */}
          <div className="w-full flex flex-col gap-3 mb-12">
            <button
              onClick={() => navigate('/client/checkin')}
              className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-5 py-4 flex items-center gap-4 text-left hover:border-[#3A3A3C] transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-barlow text-sm font-semibold text-white">Check In</p>
                <p className="font-barlow text-xs text-white/30 mt-0.5">Submit your weekly check-in</p>
              </div>
            </button>

            <button
              onClick={() => navigate('/client/messages')}
              className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-5 py-4 flex items-center gap-4 text-left hover:border-[#3A3A3C] transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div>
                <p className="font-barlow text-sm font-semibold text-white">Message {trainerFirstName}</p>
                <p className="font-barlow text-xs text-white/30 mt-0.5">Send a message to your coach</p>
              </div>
            </button>

            <button
              onClick={() => navigate('/client/vault')}
              className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-5 py-4 flex items-center gap-4 text-left hover:border-[#3A3A3C] transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <div>
                <p className="font-barlow text-sm font-semibold text-white">View Vault</p>
                <p className="font-barlow text-xs text-white/30 mt-0.5">Documents and resources</p>
              </div>
            </button>
          </div>

          {/* Gold pulsing dot */}
          <div className="relative w-4 h-4">
            <div className="absolute inset-0 rounded-full bg-[#C9A84C]/40 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="w-4 h-4 rounded-full bg-[#C9A84C]/70" />
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 3 — REST DAY (all days completed)
  // ─────────────────────────────────────────────────────────────────────────

  if (isRestDay) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] pb-24">
        <div className="max-w-[390px] mx-auto px-4 pt-12">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="font-barlow text-white/40 text-sm">{getGreeting()},</p>
              <h1 className="font-bebas text-5xl text-white tracking-wide leading-tight">{firstName}.</h1>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-8 h-8 rounded-full bg-[#C9A84C]/20 flex items-center justify-center">
                <span className="font-bebas text-sm text-[#C9A84C]">{trainerInitial}</span>
              </div>
              <span className="font-barlow text-xs text-white/40">{trainerFirstName}</span>
            </div>
          </div>

          {/* Program pill */}
          <div className="mb-5 inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-full px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]" />
            <span className="font-barlow text-xs text-[#C9A84C]">
              {programName} · Week {currentWeek} of {numWeeks}
            </span>
          </div>

          {/* Check-in banner */}
          {hasCheckedInThisWeek === false && (
            <button
              onClick={() => navigate('/client/checkin')}
              className="w-full mb-4 flex items-center gap-3 bg-[#1C1C1E] border border-[#2C2C2E] border-l-[#C9A84C] border-l-4 rounded-2xl px-4 py-4 text-left"
            >
              <div className="flex-1">
                <p className="font-barlow text-sm font-semibold text-[#C9A84C]">Your weekly check-in is due.</p>
                <p className="font-barlow text-xs text-[#C9A84C]/60 mt-0.5">Tap to complete</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}

          {/* Rest Day card */}
          <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-5 mb-4">
            <h2 className="font-bebas text-4xl text-white tracking-wide leading-tight mb-3">Rest Day</h2>
            <p className="font-barlow text-sm text-white/30">
              Recovery is part of the program. Rest up — you have earned it.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 2 — TRAINING DAY
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-[390px] mx-auto px-4 pt-12">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-barlow text-white/40 text-sm">{getGreeting()},</p>
            <h1 className="font-bebas text-5xl text-white tracking-wide leading-tight">{firstName}.</h1>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-8 h-8 rounded-full bg-[#C9A84C]/20 flex items-center justify-center">
              <span className="font-bebas text-sm text-[#C9A84C]">{trainerInitial}</span>
            </div>
            <span className="font-barlow text-xs text-white/40">{trainerFirstName}</span>
          </div>
        </div>

        {/* Program pill — tappable */}
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-full px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]" />
            <span className="font-barlow text-xs text-[#C9A84C]">
              {programName} · Week {currentWeek} of {numWeeks}
            </span>
          </div>
          <button
            onClick={() => navigate('/client/program')}
            className="inline-flex items-center gap-1.5 bg-[#2C2C2E] hover:bg-[#3A3A3C] border border-[#3A3A3C] rounded-full px-3 py-1.5 transition-colors"
          >
            <span className="font-barlow text-xs text-white/60">View program</span>
            <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        {/* ── Check-in banner ── */}
        {hasCheckedInThisWeek === false && (
          <button
            onClick={() => navigate('/client/checkin')}
            className="w-full mb-4 flex items-center gap-3 bg-[#1C1C1E] border border-[#2C2C2E] border-l-[#C9A84C] border-l-4 rounded-2xl px-4 py-4 text-left"
          >
            <div className="flex-1">
              <p className="font-barlow text-sm font-semibold text-[#C9A84C]">Your weekly check-in is due.</p>
              <p className="font-barlow text-xs text-[#C9A84C]/60 mt-0.5">Tap to complete</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}

        {/* ── Today card ── */}
        <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-5 mb-2">
          {/* Top row */}
          <div className="flex items-start justify-between mb-3">
            <p className="font-barlow text-xs text-white/40 uppercase tracking-wider">
              Day {suggestedWorkout.day_number} of {numDays}
            </p>
            {todayExercises.length > 0 && (
              <span className="bg-[#C9A84C]/15 text-[#C9A84C] font-bebas text-sm px-2.5 py-0.5 rounded-full tracking-wide">
                {todayExercises.length} exercises
              </span>
            )}
          </div>

          {/* Day name */}
          <h2 className="font-bebas text-4xl text-white tracking-wide leading-tight mb-4">
            {suggestedWorkout.name}
          </h2>

          {todayCompleted ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="font-barlow text-sm text-green-400">Completed</span>
            </div>
          ) : (
            <>
              {/* Exercise preview */}
              <div className="flex flex-col gap-1.5 mb-4">
                {todayExercises.slice(0, 2).map(ex => {
                  const sets = ex.workout_set_prescriptions?.length ?? 0
                  const rpe = ex.workout_set_prescriptions?.[0]?.rpe_target
                  return (
                    <div key={ex.id} className="flex items-center justify-between">
                      <span className="font-barlow text-sm text-white/70">{ex.exercises?.name ?? 'Exercise'}</span>
                      <span className="font-barlow text-xs text-white/30">{sets} sets{rpe ? ` · RPE ${rpe}` : ''}</span>
                    </div>
                  )
                })}
                {todayExercises.length > 2 && (
                  <p className="font-barlow text-xs text-white/25">+ {todayExercises.length - 2} more</p>
                )}
              </div>

              {/* View today's workout link */}
              <button
                onClick={() => navigate(`/client/program?day=${suggestedWorkout.day_number}`)}
                className="w-full mb-3 font-barlow text-xs text-[#C9A84C]/70 hover:text-[#C9A84C] transition-colors"
              >
                View today's workout
              </button>

              {/* START SESSION button */}
              <button
                onClick={() => startSession()}
                disabled={startingSession}
                className="w-full bg-[#C9A84C] text-black font-bebas text-xl tracking-widest rounded-xl py-4 hover:bg-[#E2C070] transition-colors min-h-[56px] disabled:opacity-50"
              >
                {startingSession ? 'STARTING...' : 'START SESSION'}
              </button>
            </>
          )}
        </div>

        {/* Choose a Different Day */}
        {!todayCompleted && suggestedWorkout && (
          <button
            onClick={() => setShowDayPicker(true)}
            className="w-full mb-4 bg-[#1C1C1E] border border-[#C9A84C]/40 rounded-xl font-barlow text-sm text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-colors min-h-[44px]"
          >
            Choose a Different Day
          </button>
        )}

        {/* ── Extra workout ── */}
        <button
          onClick={() => { setShowExtraSheet(true); setExtraType(null) }}
          className="w-full mt-3 border border-[#2C2C2E] rounded-2xl py-4 font-barlow text-sm text-white/30 hover:text-white/60 hover:border-[#3A3A3C] transition-colors min-h-[56px]"
        >
          + Log extra workout
        </button>
      </div>

      {/* ── Day picker bottom sheet ── */}
      {showDayPicker && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center" onClick={() => setShowDayPicker(false)}>
          <div className="bg-[#1C1C1E] rounded-t-2xl border-t border-[#2C2C2E] w-full max-w-[500px] flex flex-col" style={{ maxHeight: '75vh' }} onClick={e => e.stopPropagation()}>
            {/* Fixed header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#2C2C2E] flex-shrink-0">
              <h2 className="font-bebas text-xl text-white tracking-wide">Choose a Day</h2>
              <button onClick={() => setShowDayPicker(false)} className="text-white/40 hover:text-white text-xl leading-none">×</button>
            </div>

            {/* Scrollable day list */}
            <div className="overflow-y-auto p-4 flex flex-col gap-3">
              {workouts.map(w => {
                const isDone = completedSessions.some(s => s.workout_id === w.id)
                const isToday = w.id === suggestedWorkout?.id
                const isRest = w.focus === 'rest_day'
                const exerciseNames = dayExerciseNames[w.id] ?? []
                const statusLabel = isDone ? 'Done' : isToday ? 'Today' : isRest ? 'Rest' : 'Available'
                const statusColor = isDone ? 'text-green-400 bg-green-500/15' : isToday ? 'text-[#C9A84C] bg-[#C9A84C]/15' : 'text-white/30 bg-white/5'

                return (
                  <button
                    key={w.id}
                    onClick={() => {
                      if (isRest) return
                      setShowDayPicker(false)
                      startSession(w)
                    }}
                    disabled={isRest}
                    className={`rounded-xl text-left transition-colors border p-4 ${
                      isDone ? 'bg-green-500/5 border-green-500/20'
                        : isToday ? 'border-[#C9A84C]/30 bg-[#C9A84C]/5'
                        : isRest ? 'border-[#2C2C2E] bg-[#1C1C1E] opacity-40'
                        : 'border-[#2C2C2E] bg-[#2C2C2E] hover:bg-[#3A3A3C]'
                    }`}
                  >
                    {/* Day heading row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isToday ? 'bg-[#C9A84C] text-black' : isDone ? 'bg-green-500/20 text-green-400' : 'bg-[#3A3A3C] text-white/50'
                        }`}>
                          <span className="font-bebas text-base">{isRest ? 'R' : w.day_number}</span>
                        </div>
                        <p className="font-barlow text-sm font-semibold text-white">{w.name}</p>
                      </div>
                      <span className={`font-barlow text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full flex-shrink-0 ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>

                    {/* Exercise preview */}
                    {isRest ? (
                      <p className="font-barlow text-xs text-white/25 pl-12">Rest Day</p>
                    ) : exerciseNames.length > 0 ? (
                      <div className="pl-12">
                        {exerciseNames.slice(0, 3).map((name, i) => (
                          <p key={i} className="font-barlow text-xs text-white/35 leading-relaxed">{name}</p>
                        ))}
                        {exerciseNames.length > 3 && (
                          <p className="font-barlow text-xs text-white/20 mt-0.5">+ {exerciseNames.length - 3} more</p>
                        )}
                      </div>
                    ) : (
                      <p className="font-barlow text-xs text-white/25 pl-12">No exercises</p>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Extra workout bottom sheet ── */}
      {showExtraSheet && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center">
          <div className="bg-[#1C1C1E] rounded-t-2xl border-t border-[#2C2C2E] w-full max-w-[500px] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#2C2C2E]">
              <h2 className="font-bebas text-lg text-white tracking-wide">Log Extra Workout</h2>
              <button onClick={() => { setShowExtraSheet(false); setExtraType(null) }} className="text-white/40 hover:text-white text-lg">×</button>
            </div>
            <div className="p-4">
              {!extraType ? (
                <div className="flex flex-wrap gap-2">
                  {['Strength', 'Cardio', 'Mobility', 'Sport', 'Other'].map(t => (
                    <button key={t} onClick={() => setExtraType(t)} className="px-4 py-2.5 bg-[#2C2C2E] hover:bg-[#3A3A3C] rounded-xl font-barlow text-sm text-white transition-colors">{t}</button>
                  ))}
                </div>
              ) : extraType === 'Strength' ? (
                <div>
                  <p className="font-barlow text-sm text-white/50 mb-3">This will open a free-form session where you can search and add exercises.</p>
                  <button onClick={saveExtraWorkout} disabled={savingExtra} className="w-full bg-[#C9A84C] text-black font-bebas text-sm tracking-widest py-3 rounded-xl hover:bg-[#E2C070] transition-colors disabled:opacity-50">
                    {savingExtra ? 'Starting...' : 'Start Strength Session'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="font-barlow text-xs text-[#C9A84C] uppercase tracking-wider">{extraType}</p>
                  <div>
                    <label className="font-barlow text-xs text-white/30 block mb-1">Duration (minutes)</label>
                    <input type="number" value={extraDuration} onChange={e => setExtraDuration(e.target.value)} placeholder="e.g. 45" className="w-full bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-3 py-2 font-barlow text-sm text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50" />
                  </div>
                  {extraType === 'Cardio' && (
                    <div>
                      <label className="font-barlow text-xs text-white/30 block mb-1">RPE</label>
                      <input type="number" step="0.5" min="1" max="10" value={extraRpe} onChange={e => setExtraRpe(e.target.value)} placeholder="e.g. 6" className="w-full bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-3 py-2 font-barlow text-sm text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50" />
                    </div>
                  )}
                  <div>
                    <label className="font-barlow text-xs text-white/30 block mb-1">Notes</label>
                    <textarea value={extraNotes} onChange={e => setExtraNotes(e.target.value)} placeholder="What did you do?" rows={2} className="w-full bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-3 py-2 font-barlow text-sm text-white placeholder-white/20 resize-none outline-none focus:border-[#C9A84C]/50" />
                  </div>
                  <button onClick={saveExtraWorkout} disabled={savingExtra} className="w-full bg-[#C9A84C] text-black font-bebas text-sm tracking-widest py-3 rounded-xl hover:bg-[#E2C070] transition-colors disabled:opacity-50">
                    {savingExtra ? 'Saving...' : 'Save Workout'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

