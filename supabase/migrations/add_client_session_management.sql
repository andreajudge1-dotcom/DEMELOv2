-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql/new
--
-- PROBLEM
-- The "Cancel session" / "Discard session" button on the client Session page
-- (src/pages/client/Session.tsx → cancelSession()) was failing silently.
-- The function does:
--   1. SELECT  session_exercises  WHERE session_id = X
--   2. DELETE  session_sets        WHERE session_exercise_id IN (...)
--   3. DELETE  session_exercises   WHERE id IN (...)
--   4. DELETE  sessions            WHERE id = X
-- but the only RLS policies on `sessions` and `session_exercises` were:
--   - "Trainer manages sessions/session_exercises" (only matches trainer_id = auth.uid)
--   - "Client reads own sessions/session_exercises"  (FOR SELECT only)
-- so the client's DELETE was silently dropped by RLS, leaving an orphaned
-- in_progress session in the database after every "Discard". The user could
-- still start a NEW session afterward (Home.tsx INSERT works because some
-- INSERT policy exists in the deployed DB), but the orphaned row stuck around
-- and made the dashboard / progress views inconsistent.
--
-- FIX
-- Add a single FOR ALL policy on each of `sessions` and `session_exercises`
-- that matches "this row belongs to a session whose client.profile_id is the
-- caller". That covers SELECT/INSERT/UPDATE/DELETE in one shot, including:
--   - Home.tsx startSession()         (INSERT sessions)
--   - Session.tsx finishSession()     (UPDATE sessions)
--   - Session.tsx cancelSession()     (DELETE sessions + session_exercises + session_sets)
--   - Session.tsx seedFromWorkout()   (INSERT session_exercises during seed)
--   - Session.tsx handleSwap()        (UPDATE session_exercises)
--   - Session.tsx handleAddExercise() (INSERT session_exercises)
--   - Session.tsx handleSkip()        (UPDATE session_exercises)
-- session_sets already has a "Client logs own sets" FOR ALL policy, so it's
-- not affected here.
--
-- Drop-and-recreate is idempotent so this can be run multiple times.

-- ── 1. Sessions ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Client manages own sessions" ON sessions;

CREATE POLICY "Client manages own sessions"
  ON sessions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = sessions.client_id
        AND c.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = sessions.client_id
        AND c.profile_id = auth.uid()
    )
  );

-- ── 2. Session Exercises ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Client manages own session exercises" ON session_exercises;

CREATE POLICY "Client manages own session exercises"
  ON session_exercises
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN clients c ON c.id = s.client_id
      WHERE s.id = session_exercises.session_id
        AND c.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN clients c ON c.id = s.client_id
      WHERE s.id = session_exercises.session_id
        AND c.profile_id = auth.uid()
    )
  );

-- ── 3. Reload PostgREST schema cache so the new policies take effect now ───
NOTIFY pgrst, 'reload schema';

-- ── 4. Verification ─────────────────────────────────────────────────────────
-- Should show the two new policies plus the trainer/read policies that were
-- already there.
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('sessions', 'session_exercises')
ORDER BY tablename, policyname;
