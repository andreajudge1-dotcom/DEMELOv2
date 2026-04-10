-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql/new
--
-- PROBLEM
-- Andrea Test's client home page is showing "Female Training Program" as the
-- active program, but the trainer actually assigned "Josh Test" as the latest
-- program. That means `client_cycle_assignments` still has the old
-- "Female Training Program" row with `is_active = true` — the deactivate step
-- in Programs.tsx handleAssign() silently failed.
--
-- Why it silently failed: Programs.tsx line 241 did
--     .update({ is_active: false, status: 'completed' })
-- without checking for an error. The deployed `client_cycle_assignments`
-- table does NOT have a `status` column (schema.sql drifted from the real DB
-- — the Programs.tsx fetchAll() comment on line 178-179 even says this
-- explicitly about `trainer_id`). PostgREST rejected the UPDATE with a 400
-- "column 'status' does not exist" but the code ignored the error, so the
-- old assignment stayed is_active=true while the new Josh Test assignment
-- was also inserted is_active=true. The app's
--     ORDER BY created_at DESC LIMIT 1
-- then returned whichever had the later timestamp.
--
-- FIX (three parts)
-- 1. INSPECT — list all of Andrea Test's client_cycle_assignments rows so we
--    know exactly what state the DB is in before we touch anything.
-- 2. CLEAN UP — for every client, keep only the most-recently-created active
--    assignment and set every other row's is_active = false. This is safe
--    because:
--      - The "active" program by design is supposed to be unique per client.
--      - The app code always reads `ORDER BY created_at DESC LIMIT 1` so the
--        most recent one is already what the user expects to see.
--      - The old rows aren't deleted — they stay as history, just inactive.
-- 3. VERIFY — confirm there's now at most one active row per client.

-- ── 1. INSPECT — Andrea Test specifically ─────────────────────────────────
-- Uncomment and run this first by itself to see the damage before cleaning.
-- SELECT
--   cca.id                     AS assignment_id,
--   c.full_name                AS client,
--   tc.name                    AS program,
--   cca.is_active,
--   cca.created_at,
--   cca.next_day_number
-- FROM client_cycle_assignments cca
-- JOIN clients         c  ON c.id  = cca.client_id
-- JOIN training_cycles tc ON tc.id = cca.cycle_id
-- WHERE c.full_name ILIKE 'Andrea Test%'
-- ORDER BY cca.created_at DESC;

-- ── 2. CLEAN UP — keep only the newest active row per client ──────────────
-- This uses a CTE to find the id of the most recent active row per client,
-- then sets is_active = false on every other row that is currently active.
WITH newest_per_client AS (
  SELECT DISTINCT ON (client_id)
    id, client_id
  FROM client_cycle_assignments
  WHERE is_active = true
  ORDER BY client_id, created_at DESC
)
UPDATE client_cycle_assignments cca
SET is_active = false
WHERE cca.is_active = true
  AND cca.id NOT IN (SELECT id FROM newest_per_client);

-- ── 3. VERIFY — each client should now have at most one is_active=true row ─
-- Should return zero rows. If anything comes back, the cleanup didn't fully
-- work and we need to investigate further.
SELECT
  c.full_name      AS client,
  COUNT(*)         AS active_assignments
FROM client_cycle_assignments cca
JOIN clients c ON c.id = cca.client_id
WHERE cca.is_active = true
GROUP BY c.full_name
HAVING COUNT(*) > 1;

-- And finally, show Andrea Test's current state so you can confirm the right
-- program is showing as active.
SELECT
  c.full_name      AS client,
  tc.name          AS program,
  cca.is_active,
  cca.created_at
FROM client_cycle_assignments cca
JOIN clients         c  ON c.id  = cca.client_id
JOIN training_cycles tc ON tc.id = cca.cycle_id
WHERE c.full_name ILIKE 'Andrea Test%'
ORDER BY cca.created_at DESC;
