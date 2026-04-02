import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import ExercisePicker from '../../components/ExercisePicker'
import SetPrescriptionEditor from '../../components/SetPrescriptionEditor'
import type { SetPrescription } from '../../components/SetPrescriptionEditor'
import Select from '../../components/Select'

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
  superset_group: string | null
  position: number
  cue_override: string
  notes: string
  sets: SetPrescription[]
}

interface WorkoutDay {
  id: string | null
  day_number: number
  name: string
  focus: string
  is_rest_day: boolean
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
  const fromTemplate = searchParams.get('from') === 'template'
  const templateId = searchParams.get('templateId')

  const [clients, setClients] = useState<Client[]>([])
  const [form, setForm] = useState({
    name: '',
    description: '',
    numWeeks: 4,
    numDays: 4,
    coverPhotoUrl: COVER_OPTIONS[0],
    isTemplate: false,
    assignToClientId: preselectedClientId ?? '',
    tags: [] as string[],
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
  const [pickerFilter, setPickerFilter] = useState<string | undefined>(undefined)
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [showSummary, setShowSummary] = useState(false)

  useEffect(() => { fetchClients() }, [])

  useEffect(() => {
    if (editProgramId) {
      loadExistingProgram(editProgramId)
    } else if (fromTemplate && templateId) {
      loadTemplate(templateId)
    }
  }, [editProgramId, templateId])

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
      tags: cycle.tags ?? [],
    })
    setProgramId(pid)
    await loadDays(pid, cycle.num_days)
    setStep('builder')
  }

  async function loadTemplate(tid: string) {
    setSaving(true)

    // 1. Fetch the template cycle
    const { data: cycle } = await supabase
      .from('training_cycles')
      .select('*')
      .eq('id', tid)
      .single()
    if (!cycle) { setSaving(false); return }

    // 2. Create a new cycle as a copy
    const { data: newCycle } = await supabase
      .from('training_cycles')
      .insert({
        trainer_id: profile?.id,
        name: cycle.name + ' (copy)',
        description: cycle.description ?? null,
        cover_photo_url: cycle.cover_photo_url ?? null,
        num_days: cycle.num_days,
        num_weeks: cycle.num_weeks ?? 4,
        is_template: false,
        tags: cycle.tags ?? [],
      })
      .select()
      .single()
    if (!newCycle) { setSaving(false); return }

    // 3. Fetch template workouts
    const { data: workouts } = await supabase
      .from('workouts')
      .select('id, day_number, name, focus')
      .eq('cycle_id', tid)
      .order('day_number')

    // 4. Deep copy each workout + exercises + sets
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
          .insert({ workout_id: newWorkout.id, exercise_id: we.exercise_id, position: we.position, superset_group: (we as any).superset_group ?? null, cue_override: (we as any).cue_override ?? null, notes: we.notes ?? null })
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

    // 5. Update local form + load into builder
    setForm({
      name: newCycle.name,
      description: newCycle.description ?? '',
      numWeeks: newCycle.num_weeks ?? 4,
      numDays: newCycle.num_days,
      coverPhotoUrl: newCycle.cover_photo_url ?? COVER_OPTIONS[0],
      isTemplate: false,
      assignToClientId: preselectedClientId ?? '',
      tags: newCycle.tags ?? [],
    })
    setProgramId(newCycle.id)
    await loadDays(newCycle.id, newCycle.num_days)
    setStep('builder')
    setSaving(false)
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
      const isRestDay = workout?.focus === 'rest_day'
      const day: WorkoutDay = {
        id: workout?.id ?? null,
        day_number: d,
        name: workout?.name ?? `Day ${d}`,
        focus: isRestDay ? '' : (workout?.focus ?? ''),
        is_rest_day: isRestDay,
        exercises: [],
      }
      if (workout?.id) {
        const { data: weData } = await supabase
          .from('workout_exercises')
          .select('id, exercise_id, position, notes, cue_override, superset_group, exercises(name, is_unilateral, per_side)')
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
            superset_group: (we as any).superset_group ?? null,
            position: we.position,
            cue_override: (we as any).cue_override ?? '',
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
        tags: form.tags,
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
      is_rest_day: false,
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

      const workoutFocus = day.is_rest_day ? 'rest_day' : (day.focus || null)
      if (!workoutId) {
        const { data: workoutData } = await supabase
          .from('workouts')
          .insert({ cycle_id: programId, day_number: day.day_number, name: day.name, focus: workoutFocus })
          .select()
          .single()
        workoutId = workoutData?.id ?? null
      } else {
        await supabase.from('workouts').update({ name: day.name, focus: workoutFocus }).eq('id', workoutId)
      }

      if (!workoutId) continue
      if (day.is_rest_day) continue

      for (const exercise of day.exercises) {
        let workoutExerciseId = exercise.id

        if (!workoutExerciseId || workoutExerciseId.startsWith('local-')) {
          const { data: exData } = await supabase
            .from('workout_exercises')
            .insert({
              workout_id: workoutId,
              exercise_id: exercise.exercise_id || null,
              position: exercise.position,
              superset_group: exercise.superset_group ?? null,
              cue_override: exercise.cue_override || null,
              notes: exercise.notes || null,
            })
            .select()
            .single()
          workoutExerciseId = exData?.id ?? null
        } else {
          await supabase.from('workout_exercises').update({
            position: exercise.position,
            superset_group: exercise.superset_group ?? null,
            cue_override: exercise.cue_override || null,
            notes: exercise.notes || null,
          }).eq('id', workoutExerciseId)
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

  function addExerciseFromPicker(ex: { id: string; name: string; is_unilateral?: boolean; per_side?: boolean; default_cue?: string; custom_cue?: string | null }) {
    setDays(prev => prev.map((d, i) => {
      if (i !== activeDayIndex) return d
      const newEx: WorkoutExercise = {
        id: `local-${crypto.randomUUID()}`,
        exercise_id: ex.id,
        exercise_name: ex.name,
        is_unilateral: ex.is_unilateral ?? false,
        per_side: ex.per_side ?? false,
        superset_group: null,
        position: d.exercises.length,
        cue_override: ex.custom_cue || ex.default_cue || '',
        notes: '',
        sets: [makeDefaultSet(1)],
      }
      return { ...d, exercises: [...d.exercises, newEx] }
    }))
    setShowPicker(false)
  }

  const [supersetPickerFor, setSupersetPickerFor] = useState<number | null>(null)

  function nextSupersetLabel(): string {
    const used = new Set(
      (days[activeDayIndex]?.exercises ?? [])
        .map(e => e.superset_group)
        .filter(Boolean)
    )
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    return labels.find(l => !used.has(l)) ?? 'A'
  }

  function addToSuperset(exIdx: number, targetIdx: number) {
    const day = days[activeDayIndex]
    const targetEx = day.exercises[targetIdx]
    const label = targetEx.superset_group ?? nextSupersetLabel()
    setDays(prev => prev.map((d, di) => di === activeDayIndex ? {
      ...d,
      exercises: d.exercises.map((e, ei) => {
        if (ei === exIdx) return { ...e, superset_group: label }
        if (ei === targetIdx && !e.superset_group) return { ...e, superset_group: label }
        return e
      })
    } : d))
    setSupersetPickerFor(null)
  }

  function removeFromSuperset(exIdx: number) {
    setDays(prev => prev.map((d, di) => di === activeDayIndex ? {
      ...d,
      exercises: d.exercises.map((e, ei) => ei === exIdx ? { ...e, superset_group: null } : e)
    } : d))
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
              <Select
                value={String(form.numDays)}
                onChange={val => setForm(f => ({ ...f, numDays: Number(val) }))}
                options={[2, 3, 4, 5, 6, 7].map(n => ({ value: String(n), label: `${n} days` }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-2">Duration (weeks)</label>
              <Select
                value={String(form.numWeeks)}
                onChange={val => setForm(f => ({ ...f, numWeeks: Number(val) }))}
                options={[2, 3, 4, 6, 8, 10, 12, 16].map(n => ({ value: String(n), label: `${n} weeks` }))}
                className="w-full"
              />
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
              <Select
                value={form.assignToClientId}
                onChange={val => setForm(f => ({ ...f, assignToClientId: val }))}
                placeholder="No client — save as standalone"
                options={clients.map(c => ({ value: c.id, label: c.full_name }))}
                className="w-full"
              />
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-2">
              Program tags
            </label>
            <div className="flex gap-2 flex-wrap">
              {['Strength','Hypertrophy','Power','Conditioning','Beginner','Fat Loss','Sport Specific','Rehab'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setForm(f => ({
                    ...f,
                    tags: f.tags.includes(tag)
                      ? f.tags.filter(t => t !== tag)
                      : [...f.tags, tag]
                  }))}
                  className={`px-3 py-1.5 rounded-full font-barlow text-xs font-semibold transition-colors border ${
                    form.tags.includes(tag)
                      ? 'bg-[#C9A84C] text-black border-[#C9A84C]'
                      : 'bg-transparent text-white/40 border-[#2C2C2E] hover:border-[#C9A84C] hover:text-white'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

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

          {/* Cover photo thumbnail — click to change */}
          <div className="relative">
            <div
              onClick={() => setShowCoverPicker(v => !v)}
              className="w-12 h-12 rounded-lg bg-cover bg-center cursor-pointer border-2 border-transparent hover:border-[#C9A84C] transition-colors flex-shrink-0"
              style={{ backgroundImage: `url(${form.coverPhotoUrl})` }}
              title="Change cover photo"
            />
            {showCoverPicker && (
              <div className="absolute left-0 top-full mt-2 z-30 bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl p-3 grid grid-cols-3 gap-2 shadow-xl w-56">
                {COVER_OPTIONS.map(url => (
                  <div
                    key={url}
                    onClick={async () => {
                      setForm(f => ({ ...f, coverPhotoUrl: url }))
                      setShowCoverPicker(false)
                      if (programId) {
                        await supabase.from('training_cycles').update({ cover_photo_url: url }).eq('id', programId)
                      }
                    }}
                    className={`h-14 rounded-lg bg-cover bg-center cursor-pointer border-2 transition-colors ${
                      form.coverPhotoUrl === url ? 'border-[#C9A84C]' : 'border-transparent hover:border-[#C9A84C]/50'
                    }`}
                    style={{ backgroundImage: `url(${url})` }}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onBlur={async () => {
                if (programId && form.name.trim()) {
                  await supabase.from('training_cycles').update({ name: form.name.trim() }).eq('id', programId)
                }
              }}
              className="font-bebas text-3xl text-white tracking-wide bg-transparent border-b border-transparent focus:border-[#C9A84C] focus:outline-none transition-colors w-80 placeholder:text-white/20"
              placeholder="Program name"
            />
            <p className="font-barlow text-xs text-white/30 mt-0.5">{form.numDays} days/week · {form.numWeeks} weeks</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSummary(true)}
            className="font-barlow text-sm text-white/40 hover:text-white border border-[#2C2C2E] hover:border-[#3A3A3C] rounded-lg px-4 py-2 transition-colors"
          >
            Summary
          </button>
          <button
            onClick={handleFinish}
            disabled={saving}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors disabled:opacity-50"
          >
            {saving ? 'SAVING...' : 'SAVE PROGRAM'}
          </button>
        </div>
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
                  : day.is_rest_day
                    ? 'bg-transparent border-transparent text-white/20 hover:text-white/40 hover:bg-[#1C1C1E]/50'
                    : 'bg-transparent border-transparent text-white/40 hover:text-white hover:bg-[#1C1C1E]'
              }`}
            >
              <p className="font-bebas text-sm tracking-wide leading-tight">Day {day.day_number}</p>
              {day.is_rest_day ? (
                <p className="font-barlow text-xs text-white/25 leading-tight mt-0.5">Rest Day</p>
              ) : (
                <>
                  <p className="font-barlow text-xs text-white/30 truncate leading-tight mt-0.5">{day.name}</p>
                  {day.exercises.length > 0 && (
                    <p className="font-barlow text-xs text-[#C9A84C]/60 mt-1">{day.exercises.length} ex.</p>
                  )}
                </>
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
            <div className="flex flex-col">
              {activeDay.is_rest_day ? (
                <div className="bg-[#141414] border border-dashed border-[#2C2C2E] rounded-xl p-12 text-center mb-3 flex flex-col items-center gap-3">
                  <p className="font-bebas text-2xl text-white/20 tracking-wide">Rest Day</p>
                  <p className="font-barlow text-xs text-white/20">No exercises scheduled for this day</p>
                  <button
                    onClick={() => setDays(prev => prev.map((d, i) => i === activeDayIndex ? { ...d, is_rest_day: false } : d))}
                    className="font-barlow text-xs text-white/30 hover:text-white border border-[#2C2C2E] hover:border-[#3A3A3C] rounded-lg px-3 py-1.5 transition-colors mt-1"
                  >
                    Remove rest day
                  </button>
                </div>
              ) : (
                <>
              {activeDay.exercises.length === 0 && (
                <div className="bg-[#1C1C1E] border border-dashed border-[#2C2C2E] rounded-xl p-10 text-center mb-3">
                  <p className="font-bebas text-lg text-white/20 tracking-wide mb-1">No exercises yet</p>
                  <p className="font-barlow text-xs text-white/20">Use the buttons below to add exercises to this day</p>
                </div>
              )}

              {(() => {
                const exercises = activeDay.exercises
                const rendered: React.ReactNode[] = []
                const renderedGroups = new Set<string>()
                exercises.forEach((ex, i) => {
                  const group = ex.superset_group
                  if (group && renderedGroups.has(group)) return
                  if (group) {
                    renderedGroups.add(group)
                    const groupExercises = exercises.map((e, idx) => ({ e, idx })).filter(({ e }) => e.superset_group === group)
                    rendered.push(
                      <div key={'ss-' + group} className="relative mb-3">
                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[#C9A84C]" style={{ borderRadius: 0 }} />
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 bg-[#C9A84C] text-black font-barlow text-xs font-bold px-2 py-0.5 rounded-full z-10 whitespace-nowrap">
                          Superset {group}
                        </div>
                        <div className="ml-9 flex flex-col">
                          {groupExercises.map(({ e: gex, idx: gIdx }, gi) => (
                            <div key={gIdx} className={`bg-[#1a1508] border border-[#C9A84C]/30 p-4 ${gi === 0 ? 'rounded-t-xl' : ''} ${gi === groupExercises.length - 1 ? 'rounded-b-xl' : 'border-b-0'}`}>
                              <div className="flex items-center gap-3 mb-2">
                                <div className="w-6 h-6 rounded-full bg-[#C9A84C]/20 border border-[#C9A84C] flex items-center justify-center flex-shrink-0">
                                  <span className="font-bebas text-xs text-[#C9A84C]">{gIdx + 1}</span>
                                </div>
                                <p className="font-barlow text-sm font-semibold text-white flex-1">{gex.exercise_name}</p>
                                <button onClick={() => setSupersetPickerFor(gIdx)} className="font-barlow text-xs text-[#C9A84C]/50 hover:text-[#C9A84C] transition-colors border border-[#C9A84C]/20 rounded-full px-2 py-0.5">+ Add to superset</button>
                                <button onClick={() => removeFromSuperset(gIdx)} className="font-barlow text-xs text-white/20 hover:text-[#E05555]">Remove from superset</button>
                                <button onClick={() => setDays(prev => prev.map((d, di) => di === activeDayIndex ? { ...d, exercises: d.exercises.filter((_, ei) => ei !== gIdx) } : d))} className="font-barlow text-xs text-white/20 hover:text-[#E05555] ml-1">Remove</button>
                              </div>
                              <SetPrescriptionEditor sets={gex.sets} isUnilateral={gex.is_unilateral} perSide={gex.per_side} onChange={(updatedSets) => setDays(prev => prev.map((d, di) => di === activeDayIndex ? { ...d, exercises: d.exercises.map((e, ei) => ei === gIdx ? { ...e, sets: updatedSets } : e) } : d))} />
                              <div className="mt-3 pt-3 border-t border-[#C9A84C]/10 flex flex-col gap-2">
                                <div>
                                  <p className="font-barlow text-xs text-white/30 uppercase tracking-widest mb-1">Program cue</p>
                                  <textarea
                                    placeholder="Override the library cue for this program only..."
                                    value={gex.cue_override}
                                    onChange={e => setDays(prev => prev.map((d, di) => di === activeDayIndex ? { ...d, exercises: d.exercises.map((ex2, ei) => ei === gIdx ? { ...ex2, cue_override: e.target.value } : ex2) } : d))}
                                    rows={2}
                                    className="w-full bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-3 py-2 text-white font-barlow text-xs placeholder:text-white/15 focus:outline-none focus:border-[#C9A84C] transition-colors resize-none"
                                  />
                                </div>
                                <div>
                                  <p className="font-barlow text-xs text-white/30 uppercase tracking-widest mb-1">Notes</p>
                                  <textarea
                                    placeholder="Exercise notes for this program..."
                                    value={gex.notes}
                                    onChange={e => setDays(prev => prev.map((d, di) => di === activeDayIndex ? { ...d, exercises: d.exercises.map((ex2, ei) => ei === gIdx ? { ...ex2, notes: e.target.value } : ex2) } : d))}
                                    rows={2}
                                    className="w-full bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-3 py-2 text-white font-barlow text-xs placeholder:text-white/15 focus:outline-none focus:border-[#C9A84C] transition-colors resize-none"
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  } else {
                    rendered.push(
                      <div key={i} className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl p-4 mb-3">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-6 h-6 rounded-full bg-[#C9A84C] flex items-center justify-center flex-shrink-0">
                            <span className="font-bebas text-xs text-black">{i + 1}</span>
                          </div>
                          <p className="font-barlow text-sm font-semibold text-white flex-1">{ex.exercise_name}</p>
                          <button onClick={() => setSupersetPickerFor(i)} className="font-barlow text-xs text-[#C9A84C]/50 hover:text-[#C9A84C] transition-colors border border-[#C9A84C]/20 rounded-full px-2 py-0.5">+ Superset</button>
                          <button onClick={() => setDays(prev => prev.map((d, di) => di === activeDayIndex ? { ...d, exercises: d.exercises.filter((_, ei) => ei !== i) } : d))} className="font-barlow text-xs text-white/20 hover:text-[#E05555]">Remove</button>
                        </div>
                        <SetPrescriptionEditor sets={ex.sets} isUnilateral={ex.is_unilateral} perSide={ex.per_side} onChange={(updatedSets) => setDays(prev => prev.map((d, di) => di === activeDayIndex ? { ...d, exercises: d.exercises.map((e, ei) => ei === i ? { ...e, sets: updatedSets } : e) } : d))} />
                        <div className="mt-3 pt-3 border-t border-[#2C2C2E] flex flex-col gap-2">
                          <div>
                            <p className="font-barlow text-xs text-white/30 uppercase tracking-widest mb-1">Program cue</p>
                            <textarea
                              placeholder="Override the library cue for this program only..."
                              value={ex.cue_override}
                              onChange={e => setDays(prev => prev.map((d, di) => di === activeDayIndex ? { ...d, exercises: d.exercises.map((ex2, ei) => ei === i ? { ...ex2, cue_override: e.target.value } : ex2) } : d))}
                              rows={2}
                              className="w-full bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-3 py-2 text-white font-barlow text-xs placeholder:text-white/15 focus:outline-none focus:border-[#C9A84C] transition-colors resize-none"
                            />
                          </div>
                          <div>
                            <p className="font-barlow text-xs text-white/30 uppercase tracking-widest mb-1">Notes</p>
                            <textarea
                              placeholder="Exercise notes for this program..."
                              value={ex.notes}
                              onChange={e => setDays(prev => prev.map((d, di) => di === activeDayIndex ? { ...d, exercises: d.exercises.map((ex2, ei) => ei === i ? { ...ex2, notes: e.target.value } : ex2) } : d))}
                              rows={2}
                              className="w-full bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-3 py-2 text-white font-barlow text-xs placeholder:text-white/15 focus:outline-none focus:border-[#C9A84C] transition-colors resize-none"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  }
                })
                return rendered
              })()}

              {/* Action buttons */}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => { setPickerFilter(undefined); setShowPicker(true) }}
                  className="flex-1 bg-[#141414] border border-dashed border-[#2C2C2E] rounded-xl py-3 font-bebas text-sm text-white/30 tracking-widest hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors"
                >
                  + Add Exercise
                </button>
                <button
                  onClick={() => { setPickerFilter('Cardio'); setShowPicker(true) }}
                  className="flex-1 bg-[#141414] border border-dashed border-[#2C2C2E] rounded-xl py-3 font-bebas text-sm text-white/30 tracking-widest hover:border-[#2dd4bf] hover:text-[#2dd4bf] transition-colors"
                >
                  + Add Cardio
                </button>
                <button
                  onClick={() => setDays(prev => prev.map((d, i) => i === activeDayIndex ? { ...d, is_rest_day: true, exercises: [] } : d))}
                  className="flex-1 bg-[#141414] border border-dashed border-[#2C2C2E] rounded-xl py-3 font-bebas text-sm text-white/30 tracking-widest hover:border-[#3A3A3C] hover:text-white/50 transition-colors"
                >
                  Rest Day
                </button>
              </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {showPicker && (
        <ExercisePicker
          onSelect={addExerciseFromPicker}
          onClose={() => setShowPicker(false)}
          defaultMuscleFilter={pickerFilter}
        />
      )}

      {showSummary && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2C2C2E] flex items-center justify-between">
              <div>
                <h2 className="font-bebas text-xl text-white tracking-wide">Program Summary</h2>
                <p className="font-barlow text-xs text-white/40 mt-0.5">{form.numDays} days · {form.numWeeks} weeks</p>
              </div>
              <button onClick={() => setShowSummary(false)} className="font-barlow text-sm text-white/40 hover:text-white">✕</button>
            </div>
            <div className="divide-y divide-[#2C2C2E] max-h-[60vh] overflow-y-auto">
              {days.map(day => (
                <div key={day.day_number} className="px-5 py-3 flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bebas text-sm ${
                    day.is_rest_day ? 'bg-[#2C2C2E] text-white/30' : 'bg-[#C9A84C]/20 text-[#C9A84C]'
                  }`}>
                    {day.day_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    {day.is_rest_day ? (
                      <p className="font-barlow text-sm text-white/30">Rest Day</p>
                    ) : (
                      <>
                        <p className="font-barlow text-sm font-semibold text-white">{day.name}</p>
                        <p className="font-barlow text-xs text-white/40 mt-0.5">
                          {day.focus ? `${day.focus} · ` : ''}{day.exercises.length} exercise{day.exercises.length !== 1 ? 's' : ''}
                        </p>
                      </>
                    )}
                  </div>
                  {!day.is_rest_day && day.exercises.length > 0 && (
                    <div className="flex flex-col gap-0.5 items-end">
                      {day.exercises.slice(0, 3).map((ex, i) => (
                        <p key={i} className="font-barlow text-xs text-white/25 truncate max-w-[120px]">{ex.exercise_name}</p>
                      ))}
                      {day.exercises.length > 3 && (
                        <p className="font-barlow text-xs text-white/20">+{day.exercises.length - 3} more</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-[#2C2C2E]">
              <button onClick={() => setShowSummary(false)} className="w-full font-barlow text-sm text-white/40 hover:text-white transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {supersetPickerFor !== null && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-sm overflow-hidden">
            <div className="p-4 border-b border-[#2C2C2E]">
              <h2 className="font-bebas text-lg text-white tracking-wide">Pair with exercise</h2>
              <p className="font-barlow text-xs text-white/40 mt-0.5">Select an exercise to group into a superset or tri-set</p>
            </div>
            <div className="divide-y divide-[#2C2C2E] max-h-64 overflow-y-auto">
              {activeDay.exercises.map((ex, idx) => {
                if (idx === supersetPickerFor) return null
                return (
                  <button key={idx} onClick={() => addToSuperset(supersetPickerFor, idx)} className="w-full text-left px-4 py-3 hover:bg-[#242424] transition-colors group">
                    <p className="font-barlow text-sm font-semibold text-white group-hover:text-[#C9A84C] transition-colors">{ex.exercise_name}</p>
                    {ex.superset_group && <p className="font-barlow text-xs text-[#C9A84C]/60 mt-0.5">Already in Superset {ex.superset_group} — will join this group</p>}
                  </button>
                )
              })}
            </div>
            <div className="p-4 border-t border-[#2C2C2E]">
              <button onClick={() => setSupersetPickerFor(null)} className="w-full font-barlow text-sm text-white/40 hover:text-white transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
