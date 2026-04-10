import { supabase } from '../lib/supabase'
import type { ParsedProgram } from './programParser'

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80'

export type SaveResult =
  | { success: true; cycleId: string }
  | { success: false; error: string }

/**
 * Persists a parsed program directly into the trainer's library as a new
 * training_cycles row plus its workouts, workout_exercises and
 * workout_set_prescriptions. Auto-creates any exercises whose names don't
 * already exist in the trainer's library so that workout_exercises always
 * has a non-null exercise_id (which session_exercises requires later).
 *
 * The created cycle is a "library original" — parent_cycle_id is null.
 * Assignment to a client is a separate step done from the Programs page.
 */
export async function saveParsedProgramToLibrary(
  parsed: ParsedProgram,
  trainerId: string
): Promise<SaveResult> {
  if (!trainerId) return { success: false, error: 'Missing trainer id' }
  if (!parsed) return { success: false, error: 'No parsed program provided' }

  // ── 1. Build a name → exercise lookup, creating any missing rows ─────────
  // We do this in three passes:
  //   a) load every exercise the trainer can see (global + their own custom)
  //   b) bulk-insert anything the parsed program references that doesn't exist
  //   c) RE-QUERY the trainer's exercises from scratch so the map is built
  //      from authoritative DB state, not from whatever .insert().select()
  //      happened to return. This is critical — the previous version trusted
  //      `.insert(rows).select(...)` to return all the inserted rows, but
  //      under certain RLS/PostgREST conditions that SELECT can come back
  //      partial or empty even when the INSERT actually succeeded. When that
  //      happened the in-memory map was incomplete, the per-exercise loop
  //      below silently `continue`d on every name it couldn't find, and the
  //      trainer ended up with a cycle that had workouts but zero
  //      workout_exercises rows.
  const loadExercises = async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, is_unilateral, per_side')
      .or(`is_global.eq.true,trainer_id.eq.${trainerId}`)
    if (error) throw new Error(`Could not load exercises: ${error.message}`)
    const map = new Map<string, { id: string; name: string; is_unilateral: boolean; per_side: boolean }>()
    for (const ex of data ?? []) {
      map.set(ex.name.toLowerCase(), ex as any)
    }
    return map
  }

  let exerciseMap: Map<string, { id: string; name: string; is_unilateral: boolean; per_side: boolean }>
  try {
    exerciseMap = await loadExercises()
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not load exercises' }
  }

  const namesToCreate = new Set<string>()
  for (const day of parsed.days ?? []) {
    for (const ex of day.exercises ?? []) {
      const name = (ex.name ?? '').trim()
      if (!name) continue
      if (!exerciseMap.has(name.toLowerCase())) {
        namesToCreate.add(name)
      }
    }
  }

  if (namesToCreate.size > 0) {
    const rows = Array.from(namesToCreate).map(name => ({
      trainer_id: trainerId,
      name,
      is_global: false,
      is_unilateral: false,
      per_side: false,
    }))
    const { error: createErr } = await supabase
      .from('exercises')
      .insert(rows)
    if (createErr) {
      return { success: false, error: `Could not create missing exercises: ${createErr.message}` }
    }
    // Re-query from authoritative DB state instead of trusting the .select()
    // chained on .insert(). See the long comment above.
    try {
      exerciseMap = await loadExercises()
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Could not reload exercises after creating new ones' }
    }
    // Sanity check: every name we just tried to insert should now be in the map.
    const stillMissing: string[] = []
    for (const n of namesToCreate) {
      if (!exerciseMap.has(n.toLowerCase())) stillMissing.push(n)
    }
    if (stillMissing.length > 0) {
      return {
        success: false,
        error: `Inserted ${namesToCreate.size} new exercises but ${stillMissing.length} are still not visible after re-query: ${stillMissing.slice(0, 3).join(', ')}${stillMissing.length > 3 ? '…' : ''}. This usually means an RLS policy is blocking the read — check the trainer's exercise read policy.`,
      }
    }
  }

  // ── 2. Insert the training_cycles row (library original) ─────────────────
  const numDays = (parsed.days?.length ?? 0) || 1
  const numWeeks = parsed.weeks && parsed.weeks > 0 ? parsed.weeks : 4
  const programName = (parsed.program_name ?? '').trim() || 'Imported Program'

  const { data: cycle, error: cycleErr } = await supabase
    .from('training_cycles')
    .insert({
      trainer_id: trainerId,
      name: programName,
      description: null,
      cover_photo_url: DEFAULT_COVER,
      num_days: numDays,
      num_weeks: numWeeks,
      is_template: false,
      tags: [],
      parent_cycle_id: null, // library original — never a client copy
    })
    .select('id')
    .single()

  if (cycleErr || !cycle) {
    return { success: false, error: `Could not create program: ${cycleErr?.message ?? 'unknown error'}` }
  }
  const cycleId = cycle.id as string

  // ── 3. For each day, create the workout + exercises + sets ──────────────
  for (let dayIdx = 0; dayIdx < (parsed.days ?? []).length; dayIdx++) {
    const day = parsed.days[dayIdx]
    const dayNumber = day.day_number ?? dayIdx + 1
    const dayName = day.day_name ?? `Day ${dayNumber}`
    const focus = day.focus ?? null

    const { data: workout, error: workoutErr } = await supabase
      .from('workouts')
      .insert({
        cycle_id: cycleId,
        day_number: dayNumber,
        name: dayName,
        focus,
      })
      .select('id')
      .single()

    if (workoutErr || !workout) {
      return { success: false, error: `Could not create workout for day ${dayNumber}: ${workoutErr?.message ?? 'unknown error'}` }
    }

    // ── Build superset group labels for this day via union-find ─────────
    // The AI parser may only put `superset_with` on one side of a pair, may
    // mismatch capitalization, or may chain three exercises together. Build
    // an undirected graph by name and label each connected group of size ≥ 2.
    const dayExercises = day.exercises ?? []
    const nameToIdx = new Map<string, number>()
    for (let i = 0; i < dayExercises.length; i++) {
      const n = (dayExercises[i].name ?? '').trim().toLowerCase()
      if (n && !nameToIdx.has(n)) nameToIdx.set(n, i)
    }

    const parent = dayExercises.map((_, i) => i)
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]]
        x = parent[x]
      }
      return x
    }
    const union = (a: number, b: number) => {
      const ra = find(a), rb = find(b)
      if (ra !== rb) parent[ra] = rb
    }

    for (let i = 0; i < dayExercises.length; i++) {
      const partnerRaw = (dayExercises[i].superset_with ?? '').trim().toLowerCase()
      if (!partnerRaw) continue
      const partnerIdx = nameToIdx.get(partnerRaw)
      if (partnerIdx !== undefined && partnerIdx !== i) {
        union(i, partnerIdx)
      }
    }

    // Group indexes by root, then assign A/B/C... to groups of size ≥ 2
    // in order of first appearance.
    const groupsByRoot = new Map<number, number[]>()
    for (let i = 0; i < dayExercises.length; i++) {
      const root = find(i)
      if (!groupsByRoot.has(root)) groupsByRoot.set(root, [])
      groupsByRoot.get(root)!.push(i)
    }

    const exerciseGroupLabel = new Map<number, string>()
    const labelChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let labelCounter = 0
    const seenRoots = new Set<number>()
    for (let i = 0; i < dayExercises.length; i++) {
      const root = find(i)
      if (seenRoots.has(root)) continue
      seenRoots.add(root)
      const group = groupsByRoot.get(root)!
      if (group.length >= 2) {
        const label = labelChars[labelCounter % 26]
        labelCounter++
        for (const idx of group) {
          exerciseGroupLabel.set(idx, label)
        }
      }
    }

    // ── Insert each exercise ────────────────────────────────────────────
    for (let exIdx = 0; exIdx < (day.exercises ?? []).length; exIdx++) {
      const ex = day.exercises[exIdx]
      const name = (ex.name ?? '').trim()
      if (!name) continue

      const matched = exerciseMap.get(name.toLowerCase())
      if (!matched) {
        // Should never happen because we just created any missing names
        // and re-queried the map. If we get here something has gone very
        // wrong (e.g. RLS is hiding the row, or the name has invisible
        // unicode that broke the lookup). Roll back the cycle so the
        // trainer doesn't end up with a partially-saved/empty program,
        // and tell them exactly which exercise was the problem.
        await supabase.from('training_cycles').delete().eq('id', cycleId)
        return {
          success: false,
          error: `Could not find or create exercise "${name}". Available exercises: ${exerciseMap.size}. The import has been rolled back — please try again or report this bug.`,
        }
      }

      const supersetGroup: string | null = exerciseGroupLabel.get(exIdx) ?? null

      const { data: we, error: weErr } = await supabase
        .from('workout_exercises')
        .insert({
          workout_id: workout.id,
          exercise_id: matched.id,
          position: exIdx,
          superset_group: supersetGroup,
          cue_override: ex.coaching_notes || null,
          notes: null,
        })
        .select('id')
        .single()

      if (weErr || !we) {
        return { success: false, error: `Could not create exercise "${name}": ${weErr?.message ?? 'unknown error'}` }
      }

      // ── Insert set prescriptions ──────────────────────────────────────
      const sets = ex.sets ?? []
      if (sets.length > 0) {
        const prescriptionRows = sets.map(s => {
          const reps = s.reps_min && s.reps_max && s.reps_min !== s.reps_max
            ? `${s.reps_min}-${s.reps_max}`
            : String(s.reps_min ?? s.reps_max ?? '')
          return {
            workout_exercise_id: we.id,
            set_number: s.set_number ?? 1,
            set_type: s.set_type ?? 'working',
            reps: reps || null,
            rpe_target: null,
            load_modifier: null,
            hold_seconds: null,
            tempo: null,
            cue: s.special_instructions || null,
          }
        })
        const { error: setsErr } = await supabase
          .from('workout_set_prescriptions')
          .insert(prescriptionRows)
        if (setsErr) {
          return { success: false, error: `Could not create sets for "${name}": ${setsErr.message}` }
        }
      }
    }
  }

  // ── 4. VERIFY: every workout in the new cycle has at least one exercise ─
  // This is the single most important check — it makes it impossible for
  // saveParsedProgramToLibrary to return success while leaving an empty
  // husk of a cycle in the database. If any workout came out empty, we
  // delete the whole cycle and surface an error so the trainer knows to
  // re-import (instead of finding out the hard way when their client hits
  // START SESSION and stares at a blank page).
  const { data: verifyWorkouts, error: verifyErr } = await supabase
    .from('workouts')
    .select('id, name, day_number, workout_exercises(id)')
    .eq('cycle_id', cycleId)
    .order('day_number')

  if (verifyErr) {
    await supabase.from('training_cycles').delete().eq('id', cycleId)
    return { success: false, error: `Could not verify imported program: ${verifyErr.message}` }
  }

  const emptyWorkouts = (verifyWorkouts ?? []).filter((w: any) => !w.workout_exercises?.length)
  if (emptyWorkouts.length > 0) {
    await supabase.from('training_cycles').delete().eq('id', cycleId)
    return {
      success: false,
      error: `Imported program had ${emptyWorkouts.length} empty workout day(s): ${emptyWorkouts.map((w: any) => w.name).join(', ')}. The source document may not have parsed cleanly — try a clearer DOCX or rebuild the program manually.`,
    }
  }

  return { success: true, cycleId }
}
