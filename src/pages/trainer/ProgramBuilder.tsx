import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import ExercisePicker from '../../components/ExercisePicker'
import SetPrescriptionEditor from '../../components/SetPrescriptionEditor'
import type { SetPrescription } from '../../components/SetPrescriptionEditor'

interface Client {
  id: string
  full_name: string
  status: string
}

interface WorkoutExercise {
  id: string
  exercise_id: string
  exercise_name: string
  is_unilateral: boolean
  per_side: boolean
  position: number
  notes: string
  sets: SetPrescription[]
}

interface WorkoutDay {
  id: string | null
  day_number: number
  name: string
  focus: string
  exercises: WorkoutExercise[]
}

const COVER_OPTIONS = [
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80',
  'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800&q=80',
  'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=800&q=80',
  'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80',
  'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800&q=80',
]

function makeDefaultSet(num: number): SetPrescription {
  return {
    set_number: num,
    set_type: num === 1 ? 'warmup' : 'working',
    reps: '',
    rpe_target: null,
    load_modifier: null,
    hold_seconds: null,
    tempo: '',
    cue: '',
  }
}

export default function ProgramBuilder() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { id: editProgramId } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const preselectedClientId = searchParams.get('clientId')

  const [clients, setClients] = useState<Client[]>([])
  const [form, setForm] = useState({
    name: '',
    description: '',
    numWeeks: 4,
    numDays: 4,
    coverPhotoUrl: COVER_OPTIONS[0],
    isTemplate: false,
    assignToClientId: preselectedClientId ?? '',
  })
  const [step, setStep] = useState<'setup' | 'builder'>('setup')
  const [programId, setProgramId] = useState<string | null>(editProgramId ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Builder state
  const [days, setDays] = useState<WorkoutDay[]>([])
  const [activeDayIndex, setActiveDayIndex] = useState(0)

  // Exercise picker
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => { fetchClients() }, [])

  useEffect(() => {
    if (editProgramId) {
      loadExistingProgram(editProgramId)
    }
  }, [editProgramId])

  async function fetchClients() {
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, status')
      .eq('trainer_id', profile?.id)
      .eq('status', 'active')
      .order('full_name')
    setClients(data ?? [])
  }

  async function loadExistingProgram(pid: string) {
    const { data: cycle } = await supabase
      .from('training_cycles')
      .select('*')
      .eq('id', pid)
      .single()
    if (!cycle) return

    setForm({
      name: cycle.name,
      description: cycle.description ?? '',
      numWeeks: cycle.num_weeks ?? 4,
      numDays: cycle.num_days,
      coverPhotoUrl: cycle.cover_photo_url ?? COVER_OPTIONS[0],
      isTemplate: cycle.is_template,
      assignToClientId: '',
    })
    setProgramId(pid)
    await loadDays(pid, cycle.num_days)
    setStep('builder')
  }

  async function loadDays(pid: string, numDays: number) {
    const { data: workouts } = await supabase
      .from('workouts')
      .select('id, day_number, name, focus')
      .eq('cycle_id', pid)
      .order('day_number')

    const builtDays: WorkoutDay[] = []
    for (let d = 1; d <= numDays; d++) {
      const workout = workouts?.find(w => w.day_number === d)
      const day: WorkoutDay = {
        id: workout?.id ?? null,
        day_number: d,
        name: workout?.name ?? `Day ${d}`,
        focus: workout?.focus ?? '',
        exercises: [],
      }
      if (workout?.id) {
        const { data: weData } = await supabase
          .from('workout_exercises')
          .select('id, exercise_id, position, notes, exercises(name, is_unilateral, per_side)')
          .eq('workout_id', workout.id)
          .order('position')

        const { data: setsData } = await supabase
          .from('workout_set_prescriptions')
          .select('*')
          .in('workout_exercise_id', (weData ?? []).map(we => we.id))
          .order('set_number')

        day.exercises = (weData ?? []).map(we => {
          const exInfo = we.exercises as unknown as { name: string; is_unilateral: boolean; per_side: boolean } | null
          return {
            id: we.id,
            exercise_id: we.exercise_id,
            exercise_name: exInfo?.name ?? '',
            is_unilateral: exInfo?.is_unilateral ?? false,
            per_side: exInfo?.per_side ?? false,
            position: we.position,
            notes: we.notes ?? '',
            sets: (setsData ?? [])
              .filter(s => s.workout_exercise_id === we.id)
              .map(s => ({
                id: s.id,
                set_number: s.set_number,
                set_type: s.set_type ?? 'working',
                reps: s.reps?.toString() ?? '',
                rpe_target: s.rpe_target ?? null,
                load_modifier: s.load_modifier ?? null,
                hold_seconds: s.hold_seconds ?? null,
                tempo: s.tempo ?? '',
                cue: s.cue ?? '',
              })),
          }
        })
      }
      builtDays.push(day)
    }
    setDays(builtDays)
  }

  async function handleSetupSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Program name is required'); return }
    setSaving(true)
    setError('')

    const { data, error: err } = await supabase
      .from('training_cycles')
      .insert({
        trainer_id: profile?.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        cover_photo_url: form.coverPhotoUrl,
        num_days: form.numDays,
        num_weeks: form.numWeeks,
        is_template: form.isTemplate,
      })
      .select()
      .single()

    if (err || !data) {
      console.error('Supabase insert error:', JSON.stringify(err))
      console.error('Profile ID:', profile?.id)
      setError(`Error: ${err?.message ?? 'Unknown error'} (Code: ${err?.code})`)
      setSaving(false)
      return
    }

    // Init empty days (client assigned on Finish)
    const initialDays: WorkoutDay[] = Array.from({ length: form.numDays }, (_, i) => ({
      id: null,
      day_number: i + 1,
      name: `Day ${i + 1}`,
      focus: '',
      exercises: [],
    }))
    setDays(initialDays)
    setProgramId(data.id)
    setStep('builder')
    setSaving(false)
  }

  async function handleFinish() {
    if (!programId) return
    setSaving(true)

    for (const day of days) {
      let workoutId = day.id

      if (!workoutId) {
        const { data: workoutData } = await supabase
          .from('workouts')
          .insert({ cycle_id: programId, day_number: day.day_number, name: day.name, focus: day.focus || null })
          .select()
          .single()
        workoutId = workoutData?.id ?? null
      } else {
        await supabase.from('workouts').update({ name: day.name, focus: day.focus || null }).eq('id', workoutId)
      }

      if (!workoutId) continue

      for (const exercise of day.exercises) {
        let workoutExerciseId = exercise.id

        if (!workoutExerciseId || workoutExerciseId.startsWith('local-')) {
          const { data: exData } = await supabase
            .from('workout_exercises')
            .insert({
              workout_id: workoutId,
              exercise_id: exercise.exercise_id || null,
              position: exercise.position,
              notes: exercise.notes || null,
            })
            .select()
            .single()
          workoutExerciseId = exData?.id ?? null
        }

        if (!workoutExerciseId) continue

        await supabase.from('workout_set_prescriptions').delete().eq('workout_exercise_id', workoutExerciseId)

        if (exercise.sets.length > 0) {
          await supabase.from('workout_set_prescriptions').insert(
            exercise.sets.map(set => ({
              workout_exercise_id: workoutExerciseId,
              set_number: set.set_number,
              set_type: set.set_type,
              reps: set.reps || null,
              rpe_target: set.rpe_target || null,
              load_modifier: set.load_modifier || null,
              hold_seconds: set.hold_seconds || null,
              tempo: set.tempo || null,
              cue: set.cue || null,
            }))
          )
        }
      }
    }

    if (form.assignToClientId) {
      const { data: existing } = await supabase
        .from('client_cycle_assignments')
        .select('id')
        .eq('client_id', form.assignToClientId)
        .eq('cycle_id', programId)
        .single()

      if (!existing) {
        await supabase.from('client_cycle_assignments').insert({
          client_id: form.assignToClientId,
          cycle_id: programId,
          trainer_id: profile?.id,
          is_active: true,
          next_day_number: 1,
        })
      }
    }

    setSaving(false)
    navigate('/trainer/programs')
  }

  function addExerciseFromPicker(ex: { id: string; name: string; is_unilateral?: boolean; per_side?: boolean }) {
    setDays(prev => prev.map((d, i) => {
      if (i !== activeDayIndex) return d
      const newEx: WorkoutExercise = {
        id: `local-${crypto.randomUUID()}`,
        exercise_id: ex.id,
        exercise_name: ex.name,
        is_unilateral: ex.is_unilateral ?? false,
        per_side: ex.per_side ?? false,
        position: d.exercises.length,
        notes: '',
        sets: [makeDefaultSet(1)],
      }
      return { ...d, exercises: [...d.exercises, newEx] }
    }))
    setShowPicker(false)
  }

  function removeExercise(exLocalId: string) {
    setDays(prev => prev.map((d, i) => {
      if (i !== activeDayIndex) return d
      return { ...d, exercises: d.exercises.filter(e => e.id !== exLocalId) }
    }))
  }

  function updateDayName(value: string) {
    setDays(prev => prev.map((d, i) => i === activeDayIndex ? { ...d, name: value } : d))
  }

  // ── SETUP STEP ──────────────────────────────────────────────────────────────
  if (step === 'setup') {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/trainer/programs')} className="font-barlow text-sm text-white/40 hover:text-white">← Programs</button>
          <h1 className="font-bebas text-4xl text-white tracking-wide">New Program</h1>
        </div>

        <form onSubmit={handleSetupSubmit} className="flex flex-col gap-6">
          {error && (
            <p className="font-barlow text-sm text-[#E05555] bg-[#E05555]/10 border border-[#E05555]/20 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          {/* Program name */}
          <div>
            <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-2">Program name *</label>
            <input
              type="text"
              placeholder="e.g. Discovery Block, Strength Phase 1..."
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-3 text-white font-barlow text-sm placeholder:text-white/20 focus:outline-none focus:border-[#C9A84C] transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-2">Description</label>
            <textarea
              placeholder="Brief notes about this program's goals or focus..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-3 text-white font-barlow text-sm placeholder:text-white/20 focus:outline-none focus:border-[#C9A84C] transition-colors resize-none"
            />
          </div>

          {/* Days per week + weeks */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-2">Days per week</label>
              <select
                value={form.numDays}
                onChange={e => setForm(f => ({ ...f, numDays: Number(e.target.value) }))}
                className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-3 text-white font-barlow text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
              >
                {[2, 3, 4, 5, 6].map(n => (
                  <option key={n} value={n}>{n} days</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-2">Duration (weeks)</label>
              <select
                value={form.numWeeks}
                onChange={e => setForm(f => ({ ...f, numWeeks: Number(e.target.value) }))}
                className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-3 text-white font-barlow text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
              >
                {[2, 3, 4, 6, 8, 10, 12, 16].map(n => (
                  <option key={n} value={n}>{n} weeks</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cover photo */}
          <div>
            <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-2">Cover photo</label>
            <div className="grid grid-cols-3 gap-2">
              {COVER_OPTIONS.map(url => (
                <div
                  key={url}
                  onClick={() => setForm(f => ({ ...f, coverPhotoUrl: url }))}
                  className={`h-20 rounded-lg bg-cover bg-center cursor-pointer border-2 transition-colors ${
                    form.coverPhotoUrl === url ? 'border-[#C9A84C]' : 'border-transparent'
                  }`}
                  style={{ backgroundImage: `url(${url})` }}
                />
              ))}
            </div>
          </div>

          {/* Assign to client */}
          {clients.length > 0 && (
            <div>
              <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-2">Assign to client (optional)</label>
              <select
                value={form.assignToClientId}
                onChange={e => setForm(f => ({ ...f, assignToClientId: e.target.value }))}
                className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-3 text-white font-barlow text-sm focus:outline-none focus:border-[#C9A84C] transition-colors"
              >
                <option value="">No client — save as standalone</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Save as template */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, isTemplate: !f.isTemplate }))}
              className={`w-10 h-6 rounded-full transition-colors relative ${form.isTemplate ? 'bg-[#C9A84C]' : 'bg-[#2C2C2E]'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.isTemplate ? 'left-4' : 'left-0.5'}`} />
            </button>
            <div>
              <p className="font-barlow text-sm text-white">Save as template</p>
              <p className="font-barlow text-xs text-white/30">Reuse this structure for future clients</p>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#C9A84C] text-black font-bebas text-lg tracking-widest rounded-lg py-3 hover:bg-[#E2C070] transition-colors disabled:opacity-50"
          >
            {saving ? 'CREATING...' : 'CREATE PROGRAM →'}
          </button>
        </form>
      </div>
    )
  }

  // ── BUILDER STEP ─────────────────────────────────────────────────────────────
  const activeDay = days[activeDayIndex]

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/trainer/programs')} className="font-barlow text-sm text-white/40 hover:text-white">← Programs</button>
          <div>
            <h1 className="font-bebas text-3xl text-white tracking-wide">{form.name}</h1>
            <p className="font-barlow text-xs text-white/30 mt-0.5">{form.numDays} days/week · {form.numWeeks} weeks</p>
          </div>
        </div>
        <button
          onClick={handleFinish}
          disabled={saving}
          className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors disabled:opacity-50"
        >
          {saving ? 'SAVING...' : 'SAVE PROGRAM'}
        </button>
      </div>

      <div className="flex gap-5">
        {/* Day sidebar */}
        <div className="w-36 flex-shrink-0 flex flex-col gap-1.5">
          {days.map((day, idx) => (
            <button
              key={day.day_number}
              onClick={() => setActiveDayIndex(idx)}
              className={`w-full text-left px-3 py-3 rounded-lg border transition-colors ${
                activeDayIndex === idx
                  ? 'bg-[#1C1C1E] border-[#C9A84C] text-white'
                  : 'bg-transparent border-transparent text-white/40 hover:text-white hover:bg-[#1C1C1E]'
              }`}
            >
              <p className="font-bebas text-sm tracking-wide leading-tight">Day {day.day_number}</p>
              <p className="font-barlow text-xs text-white/30 truncate leading-tight mt-0.5">{day.name}</p>
              {day.exercises.length > 0 && (
                <p className="font-barlow text-xs text-[#C9A84C]/60 mt-1">{day.exercises.length} ex.</p>
              )}
            </button>
          ))}
        </div>

        {/* Day editor */}
        {activeDay && (
          <div className="flex-1 min-w-0">
            {/* Day name */}
            <div className="flex items-center gap-3 mb-5">
              <input
                type="text"
                value={activeDay.name}
                onChange={e => updateDayName(e.target.value)}
                placeholder={`Day ${activeDay.day_number}`}
                className="bg-transparent border-b border-[#2C2C2E] focus:border-[#C9A84C] outline-none text-white font-bebas text-2xl tracking-wide pb-1 w-64 transition-colors placeholder:text-white/20"
              />
              <span className="font-barlow text-xs text-white/30">Day {activeDay.day_number} of {form.numDays}</span>
            </div>

            {/* Exercises */}
            <div className="flex flex-col gap-3">
              {activeDay.exercises.length === 0 && (
                <div className="bg-[#1C1C1E] border border-dashed border-[#2C2C2E] rounded-xl p-10 text-center">
                  <p className="font-bebas text-lg text-white/20 tracking-wide mb-1">No exercises yet</p>
                  <p className="font-barlow text-xs text-white/20">Tap the button below to add exercises to this day</p>
                </div>
              )}

              {activeDay.exercises.map(ex => (
                <div key={ex.id} className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl">
                  {/* Exercise header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#2C2C2E] rounded-t-xl">
                    <span className="font-barlow text-sm font-semibold text-white">{ex.exercise_name}</span>
                    <button
                      onClick={() => removeExercise(ex.id)}
                      className="font-barlow text-xs text-white/20 hover:text-[#E05555] transition-colors"
                    >
                      Remove
                    </button>
                  </div>

                  {/* Sets */}
                  <div className="px-4 pb-4">
                    <SetPrescriptionEditor
                      sets={ex.sets}
                      isUnilateral={ex.is_unilateral}
                      perSide={ex.per_side}
                      onChange={newSets => setDays(prev => prev.map((d, di) => {
                        if (di !== activeDayIndex) return d
                        return {
                          ...d,
                          exercises: d.exercises.map(e => e.id === ex.id ? { ...e, sets: newSets } : e)
                        }
                      }))}
                    />
                  </div>
                </div>
              ))}

              {/* Add exercise button */}
              <button
                onClick={() => setShowPicker(true)}
                className="w-full bg-[#141414] border border-dashed border-[#2C2C2E] rounded-xl py-4 font-bebas text-sm text-white/30 tracking-widest hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors"
              >
                + ADD EXERCISE
              </button>
            </div>
          </div>
        )}
      </div>

      {showPicker && (
        <ExercisePicker
          onSelect={addExerciseFromPicker}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
