-- Add set_type directly to session_sets so clients can read it
-- without needing RLS access to workout_set_prescriptions

alter table session_sets
  add column if not exists set_type text not null default 'working'
    check (set_type in ('warmup','working','backoff','drop','myorep','amrap','tempo','pause'));

-- Also add prescribed_reps for display in session UI
alter table session_sets
  add column if not exists prescribed_reps text;

-- Also add a client read policy for workout_set_prescriptions
-- so the join works as a fallback
create policy if not exists "Client reads set prescriptions"
  on workout_set_prescriptions
  for select
  using (
    exists (
      select 1 from workout_exercises we
      join workouts w on w.id = we.workout_id
      join training_cycles tc on tc.id = w.cycle_id
      join client_cycle_assignments cca on cca.cycle_id = tc.id
      join clients c on c.id = cca.client_id
      where we.id = workout_set_prescriptions.workout_exercise_id
        and c.profile_id = auth.uid()
    )
  );
