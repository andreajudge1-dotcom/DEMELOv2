-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/qazftlqtddhbdtwyiqev/sql/new

-- 1. Add missing columns to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cycle_id uuid REFERENCES training_cycles(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS duration_min int;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS rating int CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_context text DEFAULT 'in_person' CHECK (session_context IN ('in_person','remote','unscheduled'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS initiated_by text DEFAULT 'client' CHECK (initiated_by IN ('trainer','client'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS counts_against_package boolean DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS total_tonnage numeric;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS average_rpe numeric;

-- 2. Add missing columns to session_exercises table
ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS skipped boolean DEFAULT false;
ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS skip_note text;

-- 3. Create session_packages table
CREATE TABLE IF NOT EXISTS session_packages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trainer_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_sessions     int NOT NULL,
  sessions_remaining int NOT NULL,
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE session_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainer manages session packages"
  ON session_packages
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

CREATE POLICY "Client reads own session packages"
  ON session_packages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = session_packages.client_id
        AND c.profile_id = auth.uid()
    )
  );

-- 4. Create personal_records table if missing
CREATE TABLE IF NOT EXISTS personal_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  exercise_name  text NOT NULL,
  pr_type        text NOT NULL CHECK (pr_type IN ('weight', 'reps')),
  value          numeric NOT NULL,
  logged_at      timestamptz DEFAULT now(),
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainer manages personal records"
  ON personal_records
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = personal_records.client_id
        AND c.trainer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = personal_records.client_id
        AND c.trainer_id = auth.uid()
    )
  );

CREATE POLICY "Client reads own personal records"
  ON personal_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = personal_records.client_id
        AND c.profile_id = auth.uid()
    )
  );
