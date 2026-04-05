import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProgramInfo {
  name: string
  num_days: number
  num_weeks: number
}

interface Workout {
  id: string
  day_number: number
  name: string
  focus: string | null
}

interface SetPrescription {
  set_number: number
  set_type: string
  reps: string | null
  rpe_target: number | null
  cue: string | null
}

interface ExerciseDetail {
  position: number
  exercise_name: string
  sets: SetPrescription[]
}

interface CompletedSession {
  id: string
  workout_id: string | null
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

export default function ClientProgram() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const dayParam = searchParams.get('day') ? parseInt(searchParams.get('day')!) : null

  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState('')
  const [trainerId, setTrainerId] = useState('')
  const [cycleId, setCycleId] = useState('')
  const [programInfo, setProgramInfo] = useState<ProgramInfo | null>(null)
  const [suggestedWeek, setSuggestedWeek] = useState(1)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [selectedDayIdx, setSelectedDayIdx] = useState(0)
  const [exerciseCache, setExerciseCache] = useState<Record<string, ExerciseDetail[]>>({})
  const [loadingExercises, setLoadingExercises] = useState(false)
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>([])
  const [nextDayNumber, setNextDayNumber] = useState(1)
  const [startingSession, setStartingSession] = useState(false)

  useEffect(() => {
    if (profile?.id) loadProgram(profile.id)
  }, [profile])

  async function loadProgram(userId: string) {
    setLoading(true)

    const { data: clientRow } = await supabase
      .from('clients')
      .select('id, trainer_id')
      .eq('profile_id', userId)
      .maybeSingle()
    if (!clientRow) { setLoading(false); return }
    setClientId(clientRow.id)
    setTrainerId(clientRow.trainer_id)

    const { data: assignRow } = await supabase
      .from('client_cycle_assignments')
      .select('id, cycle_id, next_day_number, training_cycles(name, num_days, num_weeks)')
      .eq('client_id', clientRow.id)
      .eq('is_active', true)
      .maybeSingle()
    if (!assignRow || !(assignRow.training_cycles as any)?.name) { setLoading(false); return }

    const tc = assignRow.training_cycles as any
    const numDays = tc.num_days ?? 4
    const numWeeks = tc.num_weeks ?? 4
    setProgramInfo({ name: tc.name, num_days: numDays, num_weeks: numWeeks })
    setCycleId(assignRow.cycle_id)
    setNextDayNumber(assignRow.next_day_number)

    const week = Math.ceil(assignRow.next_day_number / numDays)
    setSuggestedWeek(week)

    const { data: workoutRows } = await supabase
      .from('workouts')
      .select('id, day_number, name, focus')
      .eq('cycle_id', assignRow.cycle_id)
      .order('day_number')
    setWorkouts(workoutRows ?? [])

    // Sessions completed this week
    const monday = getMondayOfWeek(new Date())
    const sunday = getSundayOfWeek(new Date())
    const { data: sessionRows } = await supabase
      .from('sessions')
      .select('id, workout_id')
      .eq('client_id', clientRow.id)
      .not('completed_at', 'is', null)
      .gte('completed_at', monday.toISOString())
      .lte('completed_at', sunday.toISOString())
    setCompletedSessions(sessionRows ?? [])

    // Default to day from URL param, or suggested day
    const targetDay = dayParam ?? assignRow.next_day_number
    const targetIdx = (workoutRows ?? []).findIndex(w => w.day_number === targetDay)
    setSelectedDayIdx(targetIdx >= 0 ? targetIdx : 0)

    setLoading(false)
  }

  // Load exercises for a workout (cached)
  async function loadExercisesForWorkout(workoutId: string) {
    if (exerciseCache[workoutId]) return
    setLoadingExercises(true)

    const { data } = await supabase
      .from('workout_exercises')
      .select('position, exercises(name), workout_set_prescriptions(set_number, set_type, reps, rpe_target, cue)')
      .eq('workout_id', workoutId)
      .order('position')

    if (data) {
      const exercises: ExerciseDetail[] = data.map((we: any) => ({
        position: we.position,
        exercise_name: we.exercises?.name ?? 'Exercise',
        sets: (we.workout_set_prescriptions ?? [])
          .sort((a: any, b: any) => a.set_number - b.set_number)
          .map((s: any) => ({
            set_number: s.set_number,
            set_type: s.set_type ?? 'working',
            reps: s.reps,
            rpe_target: s.rpe_target,
            cue: s.cue,
          })),
      }))
      setExerciseCache(prev => ({ ...prev, [workoutId]: exercises }))
    }
    setLoadingExercises(false)
  }

  // Load exercises when selected day changes
  useEffect(() => {
    const w = workouts[selectedDayIdx]
    if (w && w.focus !== 'rest_day') {
      loadExercisesForWorkout(w.id)
    }
  }, [selectedDayIdx, workouts])

  async function startSessionForDay(workout: Workout) {
    if (!clientId || !cycleId || startingSession) return
    setStartingSession(true)
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        client_id: clientId,
        trainer_id: trainerId,
        workout_id: workout.id,
        cycle_id: cycleId,
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

  // ── Derived ──
  const selectedWorkout = workouts[selectedDayIdx] ?? null
  const isRestDay = selectedWorkout?.focus === 'rest_day'
  const exercises = selectedWorkout ? (exerciseCache[selectedWorkout.id] ?? []) : []
  const completedWorkoutIds = new Set(completedSessions.map(s => s.workout_id))
  const isDayCompleted = selectedWorkout ? completedWorkoutIds.has(selectedWorkout.id) : false
  const completedSessionId = selectedWorkout
    ? completedSessions.find(s => s.workout_id === selectedWorkout.id)?.id
    : null

  // ── Render ──

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    )
  }

  if (!programInfo) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] pb-24">
        <div className="max-w-[390px] mx-auto px-4 pt-12 text-center">
          <p className="font-barlow text-white/40 text-sm mb-4">No program assigned yet.</p>
          <button onClick={() => navigate('/client/home')} className="font-barlow text-sm text-[#C9A84C]">Back to Home</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-[390px] mx-auto px-4 pt-8">

        {/* Back button */}
        <button onClick={() => navigate('/client/home')} className="font-barlow text-sm text-white/30 hover:text-white mb-4 transition-colors">
          ← Home
        </button>

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-barlow text-xs text-[#C9A84C] uppercase tracking-wider mb-1">Your Program</p>
            <h1 className="font-bebas text-4xl text-white tracking-wide">{programInfo.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-barlow text-sm text-white/40">{programInfo.num_weeks} weeks</span>
              <span className="text-white/15">·</span>
              <span className="font-barlow text-sm text-white/40">{programInfo.num_days} days/week</span>
              <span className="text-white/15">·</span>
              <span className="font-barlow text-sm text-[#C9A84C]/70">Week {suggestedWeek}</span>
            </div>
          </div>
          {/* Start Today button — only if today is training day and not completed */}
          {selectedWorkout && !isRestDay && !isDayCompleted && selectedWorkout.day_number === nextDayNumber && (
            <button
              onClick={() => startSessionForDay(selectedWorkout)}
              disabled={startingSession}
              className="bg-[#C9A84C] text-black font-bebas text-xs tracking-widest px-3 py-2 rounded-lg hover:bg-[#E2C070] transition-colors disabled:opacity-50 mt-1"
            >
              {startingSession ? 'Starting...' : 'Start Today'}
            </button>
          )}
        </div>


        {/* ── Day Tabs ── */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto scrollbar-hide pb-1">
          {workouts.map((w, idx) => {
            const isRest = w.focus === 'rest_day'
            const isSuggested = w.day_number === nextDayNumber
            const isDone = completedWorkoutIds.has(w.id)
            const isActive = idx === selectedDayIdx

            return (
              <button
                key={w.id}
                onClick={() => setSelectedDayIdx(idx)}
                className={`flex-shrink-0 flex flex-col items-center justify-center rounded-xl px-3 py-2 min-w-[48px] border transition-all ${
                  isActive
                    ? 'border-[#C9A84C] bg-[#C9A84C]/10'
                    : isDone
                      ? 'border-green-500/30 bg-green-500/5'
                      : 'border-[#2C2C2E] bg-[#1C1C1E]'
                } ${isRest ? 'opacity-40' : ''}`}
              >
                <span className={`font-bebas text-base leading-none ${
                  isActive ? 'text-[#C9A84C]' : isDone ? 'text-green-400' : isSuggested ? 'text-[#C9A84C]' : 'text-white/40'
                }`}>
                  {isRest ? 'R' : w.day_number}
                </span>
                {isDone && !isActive && (
                  <svg className="w-2.5 h-2.5 text-green-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Day Detail ── */}
        {isRestDay ? (
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] p-5 text-center">
            <h2 className="font-bebas text-2xl text-white tracking-wide mb-2">Rest Day</h2>
            <p className="font-barlow text-sm text-white/30">Recovery is part of the program. Rest up.</p>
          </div>
        ) : selectedWorkout ? (
          <div>
            {/* Day name */}
            <h2 className="font-bebas text-2xl text-white tracking-wide mb-4">{selectedWorkout.name}</h2>

            {/* Exercises */}
            {loadingExercises ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
              </div>
            ) : exercises.length === 0 ? (
              <p className="font-barlow text-sm text-white/30 text-center py-8">No exercises programmed for this day.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {exercises.map((ex, i) => (
                  <div key={i} className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-4">
                    {/* Exercise header */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-7 h-7 rounded-full bg-[#C9A84C]/15 flex items-center justify-center flex-shrink-0">
                        <span className="font-bebas text-sm text-[#C9A84C]">{i + 1}</span>
                      </div>
                      <span className="font-barlow text-sm font-semibold text-white">{ex.exercise_name}</span>
                    </div>

                    {/* Sets */}
                    {ex.sets.map(set => {
                      const colors = SET_TYPE_COLORS[set.set_type] ?? SET_TYPE_COLORS.working
                      return (
                        <div key={set.set_number} className="mb-1.5">
                          <div className="flex items-center gap-2 py-1">
                            <span className="font-barlow text-xs text-white/25 w-4 text-center">{set.set_number}</span>
                            <span
                              className="font-barlow text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                              style={{ backgroundColor: colors.bg, color: colors.text }}
                            >
                              {set.set_type}
                            </span>
                            {set.reps && (
                              <span className="font-barlow text-xs text-white/50">{set.reps} reps</span>
                            )}
                            {set.rpe_target != null && (
                              <span className="font-barlow text-xs text-white/30">RPE {set.rpe_target}</span>
                            )}
                          </div>
                          {set.cue && (
                            <p className="font-barlow text-xs text-white/25 italic pl-6 mt-0.5">{set.cue}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Bottom action */}
            <div className="mt-5">
              {isDayCompleted ? (
                <button
                  onClick={() => completedSessionId && navigate(`/client/session/${completedSessionId}`)}
                  className="w-full font-barlow text-sm text-[#C9A84C] border border-[#C9A84C]/30 rounded-xl py-3 hover:bg-[#C9A84C]/5 transition-colors"
                >
                  View Session
                </button>
              ) : (
                <button
                  onClick={() => startSessionForDay(selectedWorkout)}
                  disabled={startingSession}
                  className="w-full bg-[#C9A84C] text-black font-bebas text-lg tracking-widest py-3.5 rounded-xl hover:bg-[#E2C070] transition-colors disabled:opacity-50"
                >
                  {startingSession ? 'Starting...' : 'Start Session'}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
