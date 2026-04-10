-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql/new
--
-- PROBLEM
-- Clients viewing trainer-custom exercises through the embedded join
-- (`exercises(name)`) get null because the existing "Anyone reads global
-- exercises" policy on `exercises` only allows clients to read rows where
-- `is_global = true OR trainer_id = auth.uid()`. Trainer-custom exercises
-- have neither, so the join silently drops the name and the UI falls back
-- to the placeholder "Exercise".
--
-- This is independent of (but compounds with) the workout_exercises.exercise_id
-- null bug that's fixed in fix_workout_exercise_null_ids.sql — both need to
-- be applied for the client app to render names reliably.
--
-- FIX
-- Add a single, simple policy: a client may read any exercise owned by their
-- trainer. The subquery only touches `clients`, which the client already has
-- SELECT access to via its own RLS policy. No recursion, no chain.

-- 1. Drop any previous (chain-based) attempts so we start clean.
DROP POLICY IF EXISTS "Client reads exercises in assigned cycles" ON exercises;
DROP POLICY IF EXISTS "Client reads exercises in own sessions"   ON exercises;
DROP POLICY IF EXISTS "Client reads trainer exercises"           ON exercises;

-- 2. Allow a client to read any exercise owned by their trainer.
CREATE POLICY "Client reads trainer exercises"
  ON exercises FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.profile_id = auth.uid()
        AND c.trainer_id = exercises.trainer_id
    )
  );

-- 3. Force PostgREST to reload its schema cache so the new policy takes
--    effect immediately on the REST endpoint clients use.
NOTIFY pgrst, 'reload schema';

-- 4. Verification — should return:
--      Anyone reads global exercises
--      Client reads trainer exercises
--      Trainer manages own exercises
SELECT polname
FROM pg_policy
WHERE polrelid = 'exercises'::regclass
ORDER BY polname;
