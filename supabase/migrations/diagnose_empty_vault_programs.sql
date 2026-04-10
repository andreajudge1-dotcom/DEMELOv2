-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql/new
--
-- DIAGNOSTIC ONLY — this script does not modify any data.
--
-- WHY
-- The client Session page is loading empty (no exercise list) when starting
-- a vault-imported program. There are two possible causes:
--
--   A) The program was created BEFORE we ran fix_workout_exercise_null_ids.sql.
--      That earlier migration DELETED every workout_exercises row whose
--      exercise_id was null, so any program that was already corrupted ended
--      up with zero exercises in its workouts. The trainer would still see
--      the program in their library, the assignment would still be active,
--      and the start-session button would still load — but seedFromWorkout()
--      would have nothing to seed and the page would render empty.
--
--   B) saveParsedProgramToLibrary is silently skipping exercises during a
--      NEW vault import (e.g. the in-memory exerciseMap lookup is missing
--      keys after the bulk insert returned successfully but with no rows
--      visible to the SELECT).
--
-- This script tells you which one is happening for the user's "Female
-- Training Program" specifically, plus prints any other suspicious cycles.
--
-- Read each query, then run them one at a time to interpret.

-- ── 1. Look up the Female Training Program cycle(s) ────────────────────────
SELECT
  tc.id           AS cycle_id,
  tc.name         AS program,
  tc.parent_cycle_id,
  tc.num_days,
  tc.num_weeks,
  tc.created_at,
  p.full_name     AS trainer
FROM training_cycles tc
LEFT JOIN profiles p ON p.id = tc.trainer_id
WHERE tc.name ILIKE 'Female Training%'
ORDER BY tc.created_at DESC;

-- ── 2. For each Female Training Program, count workouts and workout_exercises ─
SELECT
  tc.name                          AS program,
  tc.id                            AS cycle_id,
  w.id                             AS workout_id,
  w.day_number,
  w.name                           AS workout_name,
  COUNT(we.id)                     AS exercise_count
FROM training_cycles tc
JOIN workouts w        ON w.cycle_id = tc.id
LEFT JOIN workout_exercises we ON we.workout_id = w.id
WHERE tc.name ILIKE 'Female Training%'
GROUP BY tc.name, tc.id, w.id, w.day_number, w.name
ORDER BY tc.created_at DESC, w.day_number;

-- INTERPRETATION
-- If exercise_count = 0 for every workout in the program, the program is
-- completely empty (case A above — the cleanup migration wiped it). The
-- trainer needs to either re-import it from the vault OR delete it.
--
-- If exercise_count > 0 for some workouts but zero for others, the parser
-- partially succeeded — the trainer should re-import.
--
-- If exercise_count > 0 for all workouts, the program is fine in the DB and
-- the bug is somewhere else (likely RLS on the client read or session insert).

-- ── 3. Find ALL cycles that have any workout with zero exercises ───────────
-- Useful for spotting other broken programs the trainer hasn't noticed yet.
SELECT
  tc.name                          AS program,
  COUNT(DISTINCT w.id)             AS total_workouts,
  COUNT(DISTINCT CASE WHEN we.id IS NULL THEN w.id END) AS empty_workouts,
  tc.created_at
FROM training_cycles tc
JOIN workouts w        ON w.cycle_id = tc.id
LEFT JOIN workout_exercises we ON we.workout_id = w.id
WHERE tc.parent_cycle_id IS NULL  -- only library originals
GROUP BY tc.id, tc.name, tc.created_at
HAVING COUNT(DISTINCT CASE WHEN we.id IS NULL THEN w.id END) > 0
ORDER BY tc.created_at DESC;
