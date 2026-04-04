import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

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

interface Notification {
  id: string
  title: string
  body: string | null
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

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ClientHome() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<ClientData | null>(null)
  const [trainer, setTrainer] = useState<TrainerData | null>(null)
  const [program, setProgram] = useState<ProgramData | null>(null)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [todayExercises, setTodayExercises] = useState<WorkoutExercise[]>([])
  const [completedSessions, setCompletedSessions] = useState<Session[]>([])
  const [notification, setNotification] = useState<Notification | null>(null)
  const [currentWeek, setCurrentWeek] = useState(1)

  useEffect(() => {
    if (profile?.id) loadAll(profile.id)
  }, [profile])

  async function loadAll(userId: string) {
    setLoading(true)

    // 1. Client record
    const { data: clientRow } = await supabase
      .from('clients')
      .select('id, full_name, trainer_id')
      .eq('profile_id', userId)
      .maybeSingle()

    if (!clientRow) { setLoading(false); return }
    setClient(clientRow)

    // 2. Trainer
    const { data: trainerRow } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', clientRow.trainer_id)
      .maybeSingle()
    setTrainer(trainerRow ?? null)

    // 3. Active program
    const { data: assignRow } = await supabase
      .from('client_cycle_assignments')
      .select('id, cycle_id, next_day_number, training_cycles(name, num_days, num_weeks)')
      .eq('client_id', clientRow.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!assignRow) { setLoading(false); return }
    setProgram(assignRow as unknown as ProgramData)

    const numDays = (assignRow.training_cycles as any).num_days ?? 4
    const week = Math.ceil(assignRow.next_day_number / numDays)
    setCurrentWeek(week)

    // 4. Workouts for this cycle
    const { data: workoutRows } = await supabase
      .from('workouts')
      .select('id, day_number, name, focus')
      .eq('cycle_id', assignRow.cycle_id)
      .order('day_number')
    setWorkouts(workoutRows ?? [])

    // 5. Today's workout exercises
    const todayWorkout = (workoutRows ?? []).find(
      w => w.day_number === assignRow.next_day_number
    )
    if (todayWorkout) {
      const { data: exRows } = await supabase
        .from('workout_exercises')
        .select('id, exercises(name), workout_set_prescriptions(rpe_target)')
        .eq('workout_id', todayWorkout.id)
        .order('position')
      setTodayExercises((exRows ?? []) as unknown as WorkoutExercise[])
    }

    // 6. Sessions completed this week
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

    // 7. Unread notifications
    const { data: notifRows } = await supabase
      .from('notifications')
      .select('id, title, body')
      .eq('profile_id', userId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
    setNotification(notifRows?.[0] ?? null)

    setLoading(false)
  }

  async function dismissNotification() {
    if (!notification) return
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notification.id)
    setNotification(null)
  }

  // ── Derived ──
  const firstName = client?.full_name?.split(' ')[0] ?? 'there'
  const trainerName = trainer?.full_name ?? 'Your coach'
  const trainerInitial = trainerName.charAt(0).toUpperCase()
  const numDays = (program?.training_cycles as any)?.num_days ?? 4
  const numWeeks = (program?.training_cycles as any)?.num_weeks ?? 4
  const programName = (program?.training_cycles as any)?.name ?? ''
  const nextDayNumber = program?.next_day_number ?? 1

  const todayWorkout = workouts.find(w => w.day_number === nextDayNumber)
  const todayCompleted = completedSessions.some(s => s.workout_id === todayWorkout?.id)

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
  // HOLDING STATE — no program
  // ─────────────────────────────────────────────────────────────────────────

  if (!program) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-6 text-center">
        <div className="flex items-center justify-center mb-8">
          <div className="relative w-4 h-4">
            <div className="absolute inset-0 rounded-full bg-[#C9A84C]/40 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="w-4 h-4 rounded-full bg-[#C9A84C]/70" />
          </div>
        </div>
        <h1 className="font-bebas text-4xl text-white tracking-wide mb-3">
          Hey {firstName}.
        </h1>
        <p className="font-barlow text-white/40 text-base leading-relaxed max-w-xs">
          Your program is on its way. Your coach will notify you when it's ready.
        </p>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIVE STATE
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-[390px] mx-auto px-4 pt-12">

        {/* ── SECTION 1: HEADER ── */}
        <div className="mb-5">
          <p className="font-barlow text-white/40 text-sm">{getGreeting()},</p>
          <h1 className="font-bebas text-5xl text-white tracking-wide leading-tight">
            {firstName}.
          </h1>

          {/* Coach row */}
          <div className="flex items-center gap-2 mt-3">
            <div className="w-7 h-7 rounded-full bg-[#C9A84C]/20 flex items-center justify-center flex-shrink-0">
              <span className="font-bebas text-sm text-[#C9A84C]">{trainerInitial}</span>
            </div>
            <span className="font-barlow text-sm text-white/40">
              Your coach: <span className="text-white/70">{trainerName}</span>
            </span>
          </div>

          {/* Program pill */}
          <div className="mt-3 inline-flex items-center gap-2 bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-full px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]" />
            <span className="font-barlow text-xs text-[#C9A84C]">
              {programName} · Week {currentWeek} of {numWeeks}
            </span>
          </div>
        </div>

        {/* ── SECTION 2: NOTIFICATION STRIP ── */}
        {notification && (
          <div className="mb-4 bg-[#1C1C1E] border border-[#2C2C2E] border-l-[#C9A84C] border-l-4 rounded-xl px-4 py-3 flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-[#C9A84C] flex-shrink-0 mt-1" />
            <div className="flex-1 min-w-0">
              <p className="font-barlow text-sm text-white leading-snug">{notification.title}</p>
              {notification.body && (
                <p className="font-barlow text-xs text-white/40 mt-0.5 truncate">{notification.body}</p>
              )}
            </div>
            <button
              onClick={dismissNotification}
              className="font-barlow text-xs text-[#C9A84C] hover:text-[#E2C070] flex-shrink-0 min-h-[44px] flex items-center"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── SECTION 3: TODAY CARD ── */}
        <TodayCard
          dayNumber={nextDayNumber}
          numDays={numDays}
          workout={todayWorkout ?? null}
          exercises={todayExercises}
          completed={todayCompleted}
          onStart={() => navigate('/client/today')}
        />

        {/* ── SECTION 4: THIS WEEK STRIP ── */}
        <WeekStrip
          workouts={workouts}
          numDays={numDays}
          nextDayNumber={nextDayNumber}
          completedSessions={completedSessions}
        />

        {/* ── SECTION 5: EXTRA WORKOUT ── */}
        <button className="w-full mt-3 border border-[#2C2C2E] rounded-2xl py-4 font-barlow text-sm text-white/30 hover:text-white/60 hover:border-[#3A3A3C] transition-colors min-h-[56px]">
          + Log extra workout
        </button>

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TODAY CARD
// ─────────────────────────────────────────────────────────────────────────────

function TodayCard({
  dayNumber,
  numDays,
  workout,
  exercises,
  completed,
  onStart,
}: {
  dayNumber: number
  numDays: number
  workout: Workout | null
  exercises: WorkoutExercise[]
  completed: boolean
  onStart: () => void
}) {
  const isRestDay = !workout

  return (
    <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-5 mb-4">
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <p className="font-barlow text-xs text-white/40 uppercase tracking-wider">
          Day {dayNumber} of {numDays}
        </p>
        {!isRestDay && exercises.length > 0 && (
          <span className="bg-[#C9A84C]/15 text-[#C9A84C] font-bebas text-sm px-2.5 py-0.5 rounded-full tracking-wide">
            {exercises.length} exercises
          </span>
        )}
      </div>

      {/* Workout name */}
      <h2 className="font-bebas text-4xl text-white tracking-wide leading-tight mb-4">
        {isRestDay ? 'Rest Day' : (workout?.name ?? 'Training Day')}
      </h2>

      {isRestDay ? (
        <p className="font-barlow text-sm text-white/30 mb-1">
          Recovery is part of the program. Rest up.
        </p>
      ) : completed ? (
        // Completed state
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="font-barlow text-sm text-green-400">Completed</span>
          <button className="font-barlow text-xs text-white/30 hover:text-white/60 ml-2 transition-colors">
            View Session
          </button>
        </div>
      ) : (
        // Exercise preview
        <>
          <div className="flex flex-col gap-1.5 mb-4">
            {exercises.slice(0, 2).map(ex => {
              const sets = ex.workout_set_prescriptions?.length ?? 0
              const rpe = ex.workout_set_prescriptions?.[0]?.rpe_target
              return (
                <div key={ex.id} className="flex items-center justify-between">
                  <span className="font-barlow text-sm text-white/70">
                    {ex.exercises?.name ?? 'Exercise'}
                  </span>
                  <span className="font-barlow text-xs text-white/30">
                    {sets} sets{rpe ? ` · RPE ${rpe}` : ''}
                  </span>
                </div>
              )
            })}
            {exercises.length > 2 && (
              <p className="font-barlow text-xs text-white/25">
                + {exercises.length - 2} more exercise{exercises.length - 2 > 1 ? 's' : ''}
              </p>
            )}
          </div>

          <button
            onClick={onStart}
            className="w-full bg-[#C9A84C] text-black font-bebas text-xl tracking-widest rounded-xl py-4 hover:bg-[#E2C070] transition-colors min-h-[56px]"
          >
            START SESSION
          </button>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEK STRIP
// ─────────────────────────────────────────────────────────────────────────────

function WeekStrip({
  workouts,
  numDays,
  nextDayNumber,
  completedSessions,
}: {
  workouts: Workout[]
  numDays: number
  nextDayNumber: number
  completedSessions: Session[]
}) {
  const monday = getMondayOfWeek(new Date())

  const days = Array.from({ length: numDays }, (_, i) => {
    const dayNum = i + 1
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const abbr = DAY_ABBR[date.getDay()]
    const workout = workouts.find(w => w.day_number === dayNum)
    const isRest = !workout
    const isToday = dayNum === nextDayNumber
    const isDone = completedSessions.some(s => s.workout_id === workout?.id)
    return { dayNum, abbr, isRest, isToday, isDone }
  })

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {days.map(({ dayNum, abbr, isRest, isToday, isDone }) => (
        <div
          key={dayNum}
          className="flex flex-col items-center justify-between rounded-xl border px-2 py-3 flex-shrink-0 w-[60px] min-h-[80px]"
          style={{
            borderColor: isDone ? '#22c55e40' : isToday ? '#C9A84C40' : '#2C2C2E',
            background: isDone ? 'rgba(34,197,94,0.05)' : isToday ? 'rgba(201,168,76,0.08)' : '#1C1C1E',
            opacity: isRest ? 0.4 : 1,
          }}
        >
          <span
            className="font-bebas text-lg leading-none"
            style={{ color: isToday ? '#C9A84C' : isDone ? '#22c55e' : 'rgba(255,255,255,0.4)' }}
          >
            {dayNum}
          </span>
          <span className="font-barlow text-[10px] text-white/30">{abbr}</span>

          {/* Status indicator */}
          <div className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{
              border: `1.5px solid ${isDone ? '#22c55e' : isToday ? '#C9A84C' : '#3A3A3C'}`,
              background: isDone ? 'rgba(34,197,94,0.15)' : 'transparent',
            }}
          >
            {isDone && (
              <svg className="w-2.5 h-2.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {isToday && !isDone && (
              <svg className="w-2.5 h-2.5 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
            {isRest && (
              <span className="font-barlow text-[8px] text-white/20">R</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
