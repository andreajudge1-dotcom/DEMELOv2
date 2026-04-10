-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql/new
--
-- PROBLEM
-- Rows in `workout_exercises` were getting `exercise_id = NULL`. This happened
-- because the original schema declared the FK as
--     exercise_id uuid references exercises(id) ON DELETE SET NULL
-- so any time the trainer (or some code path) deleted an exercise from their
-- library, every workout_exercises row that referenced it had its exercise_id
-- silently nulled out. The next time a client tried to start a session for
-- that workout, the seed loop in Session.tsx tried to insert a session_exercises
-- row with exercise_id = NULL — but session_exercises.exercise_id is NOT NULL,
-- so every insert in the loop failed with a 400 and the page rendered an
-- empty exercise list.
--
-- FIX (run in this order)
-- 1. INSPECT how many bad rows exist (and which workouts are affected) so the
--    trainer can decide whether to fix them in the builder or just delete them.
-- 2. DELETE the orphaned rows. We can't recover the original exercise — the
--    name was never copied onto workout_exercises — so the only safe option
--    is to drop them. The trainer will need to re-add the exercises in the
--    program builder. We also delete any dependent workout_set_prescriptions
--    rows so the cascade is clean.
-- 3. CHANGE the FK to ON DELETE RESTRICT and ALTER COLUMN to NOT NULL so this
--    can never happen again. From now on, deleting an exercise that's in use
--    will throw an FK violation, which is the correct behavior — the trainer
--    will see the error and know to remove the exercise from their programs
--    first.

-- ── 1. INSPECT — run this first by itself to see the damage ────────────────
-- SELECT
--   w.id          AS workout_id,
--   w.name        AS workout_name,
--   tc.name       AS program_name,
--   COUNT(we.id)  AS broken_rows
-- FROM workout_exercises we
-- JOIN workouts w          ON w.id = we.workout_id
-- JOIN training_cycles tc  ON tc.id = w.cycle_id
-- WHERE we.exercise_id IS NULL
-- GROUP BY w.id, w.name, tc.name
-- ORDER BY tc.name, w.day_number;

-- ── 2. DELETE the orphaned rows ────────────────────────────────────────────
-- First delete dependent set prescriptions (FK with ON DELETE CASCADE would
-- handle this automatically, but doing it explicitly is safer and shows
-- exactly what's being removed).
DELETE FROM workout_set_prescriptions
WHERE workout_exercise_id IN (
  SELECT id FROM workout_exercises WHERE exercise_id IS NULL
);

-- Now delete the orphaned workout_exercises themselves.
DELETE FROM workout_exercises
WHERE exercise_id IS NULL;

-- ── 3. ENFORCE the FK going forward ────────────────────────────────────────
-- Drop the old constraint (Postgres autogenerates the name as
-- workout_exercises_exercise_id_fkey when the column was declared inline).
ALTER TABLE workout_exercises
  DROP CONSTRAINT IF EXISTS workout_exercises_exercise_id_fkey;

-- Re-create it as RESTRICT so deleting an exercise that's in use throws
-- instead of silently nulling the FK.
ALTER TABLE workout_exercises
  ADD CONSTRAINT workout_exercises_exercise_id_fkey
  FOREIGN KEY (exercise_id)
  REFERENCES exercises(id)
  ON DELETE RESTRICT;

-- And finally make the column itself NOT NULL so the application can never
-- insert another orphaned row even by accident.
ALTER TABLE workout_exercises
  ALTER COLUMN exercise_id SET NOT NULL;

-- ── 4. VERIFICATION ────────────────────────────────────────────────────────
-- Should return 0 rows.
SELECT COUNT(*) AS remaining_null_rows
FROM workout_exercises
WHERE exercise_id IS NULL;

-- Should show "NO" for is_nullable.
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'workout_exercises'
  AND column_name = 'exercise_id';
