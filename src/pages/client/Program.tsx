import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

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

export default function Program() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [programInfo, setProgramInfo] = useState<ProgramInfo | null>(null)
  const [currentWeek, setCurrentWeek] = useState(1)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({})
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [dayExercises, setDayExercises] = useState<Record<string, { name: string; sets: number }[]>>({})

  useEffect(() => {
    if (profile?.id) loadProgram(profile.id)
  }, [profile])

  async function loadProgram(userId: string) {
    setLoading(true)

    const { data: clientRow } = await supabase
      .from('clients')
      .select('id')
      .eq('profile_id', userId)
      .maybeSingle()
    if (!clientRow) { setLoading(false); return }

    const { data: assignRow } = await supabase
      .from('client_cycle_assignments')
      .select('id, cycle_id, next_day_number, training_cycles(name, num_days, num_weeks)')
      .eq('client_id', clientRow.id)
      .eq('is_active', true)
      .maybeSingle()
    if (!assignRow || !(assignRow.training_cycles as any)?.name) { setLoading(false); return }

    const tc = assignRow.training_cycles as any
    setProgramInfo({ name: tc.name, num_days: tc?.num_days ?? 4, num_weeks: tc?.num_weeks ?? 4 })
    setCurrentWeek(Math.ceil(assignRow.next_day_number / (tc.num_days ?? 4)))

    const { data: workoutRows } = await supabase
      .from('workouts')
      .select('id, day_number, name, focus')
      .eq('cycle_id', assignRow.cycle_id)
      .order('day_number')
    setWorkouts(workoutRows ?? [])

    // Exercise counts per workout
    if (workoutRows && workoutRows.length > 0) {
      const ids = workoutRows.map(w => w.id)
      const { data: weData } = await supabase
        .from('workout_exercises')
        .select('workout_id')
        .in('workout_id', ids)
      if (weData) {
        const counts: Record<string, number> = {}
        weData.forEach(row => { counts[row.workout_id] = (counts[row.workout_id] ?? 0) + 1 })
        setExerciseCounts(counts)
      }
    }

    setLoading(false)
  }

  async function toggleDay(workoutId: string) {
    if (expandedDay === workoutId) { setExpandedDay(null); return }
    setExpandedDay(workoutId)

    if (dayExercises[workoutId]) return

    const { data } = await supabase
      .from('workout_exercises')
      .select('id, exercises(name), workout_set_prescriptions(id)')
      .eq('workout_id', workoutId)
      .order('position')

    if (data) {
      setDayExercises(prev => ({
        ...prev,
        [workoutId]: data.map((we: any) => ({
          name: we.exercises?.name ?? 'Exercise',
          sets: we.workout_set_prescriptions?.length ?? 0,
        })),
      }))
    }
  }

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
      <div className="max-w-[390px] mx-auto px-4 pt-10">

        {/* Back */}
        <button onClick={() => navigate('/client/home')} className="font-barlow text-sm text-white/30 hover:text-white mb-4 transition-colors">
          ← Home
        </button>

        {/* Program header */}
        <div className="mb-6">
          <p className="font-barlow text-xs text-[#C9A84C] uppercase tracking-wider mb-1">Your Program</p>
          <h1 className="font-bebas text-4xl text-white tracking-wide">{programInfo.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="font-barlow text-sm text-white/50">Week {currentWeek} of {programInfo.num_weeks}</span>
            <span className="text-white/20">·</span>
            <span className="font-barlow text-sm text-white/50">{programInfo.num_days} days/week</span>
          </div>
        </div>

        {/* Workout days */}
        <div className="flex flex-col gap-2">
          {workouts.map(w => {
            const count = exerciseCounts[w.id] ?? 0
            const isExpanded = expandedDay === w.id
            const exercises = dayExercises[w.id] ?? []

            return (
              <div key={w.id} className={`bg-[#1C1C1E] rounded-xl border transition-colors ${isExpanded ? 'border-[#C9A84C]/30' : 'border-[#2C2C2E]'}`}>
                <button
                  onClick={() => toggleDay(w.id)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-[#2C2C2E] flex items-center justify-center flex-shrink-0">
                    <span className="font-bebas text-base text-[#C9A84C]">{w.day_number}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-barlow text-sm font-semibold text-white truncate">{w.name}</p>
                    <p className="font-barlow text-xs text-white/30 mt-0.5">
                      {count} exercise{count !== 1 ? 's' : ''}
                      {w.focus && w.focus !== 'rest_day' ? ` · ${w.focus}` : ''}
                    </p>
                  </div>
                  <svg className={`w-4 h-4 text-white/25 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && exercises.length > 0 && (
                  <div className="px-4 pb-4 border-t border-[#2C2C2E] pt-3">
                    {exercises.map((ex, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-barlow text-xs text-[#C9A84C]/60 w-5 text-center">{i + 1}</span>
                          <span className="font-barlow text-sm text-white/70">{ex.name}</span>
                        </div>
                        <span className="font-barlow text-xs text-white/25">{ex.sets} sets</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
