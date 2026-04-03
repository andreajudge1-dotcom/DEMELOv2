-- =============================================================================
-- DeMelo Fitness — Master Schema
-- Single source of truth. Run on a fresh Supabase project to recreate the DB.
-- Every schema change must be added here before moving to the next prompt.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES
--    One row per auth.users entry. Role determines trainer vs client routing.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  role        text not null check (role in ('trainer', 'client')),
  created_at  timestamptz default now()
);

alter table profiles enable row level security;

create policy "Users read own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users insert own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Users update own profile"
  on profiles for update using (auth.uid() = id);


-- ---------------------------------------------------------------------------
-- 2. TRAINERS
--    Extended profile data for trainer accounts.
-- ---------------------------------------------------------------------------
create table if not exists trainers (
  id             uuid primary key references profiles(id) on delete cascade,
  business_name  text,
  bio            text,
  specialties    text[],
  created_at     timestamptz default now()
);

alter table trainers enable row level security;

create policy "Trainers read own record"
  on trainers for select using (auth.uid() = id);

create policy "Trainers insert own record"
  on trainers for insert with check (auth.uid() = id);

create policy "Trainers update own record"
  on trainers for update using (auth.uid() = id);


-- ---------------------------------------------------------------------------
-- 3. CLIENTS
--    Client roster managed by a trainer. May or may not have a linked profile.
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references profiles(id) on delete cascade,
  profile_id  uuid references profiles(id) on delete set null,
  full_name   text not null,
  email       text,
  phone       text,
  avatar_url  text,
  status      text not null default 'active' check (status in ('active', 'inactive', 'prospect', 'invited', 'paused')),
  notes       text,
  created_at  timestamptz default now()
);

alter table clients enable row level security;

create policy "Trainer manages own clients"
  on clients
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

create policy "Client reads own record"
  on clients for select
  using (profile_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 4. EXERCISES
--    Global exercise library (is_global = true) plus trainer-custom exercises.
-- ---------------------------------------------------------------------------
create table if not exists exercises (
  id                 uuid primary key default gen_random_uuid(),
  trainer_id         uuid references profiles(id) on delete cascade,
  name               text not null,
  primary_muscle     text,
  secondary_muscles  text[],
  equipment          text,
  is_unilateral      boolean default false,
  per_side           boolean default false,
  movement_pattern   text,
  difficulty         text check (difficulty in ('beginner', 'intermediate', 'advanced')),
  default_cue        text,
  video_url          text,
  custom_cue         text,
  parent_exercise_id uuid references exercises(id) on delete set null,
  is_global          boolean default false,
  created_at         timestamptz default now()
);

alter table exercises enable row level security;

create policy "Anyone reads global exercises"
  on exercises for select
  using (is_global = true or trainer_id = auth.uid());

create policy "Trainer manages own exercises"
  on exercises
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 5. EXERCISE CUSTOM CUES
--    Per-trainer overrides for the default coaching cue on any exercise.
-- ---------------------------------------------------------------------------
create table if not exists exercise_custom_cues (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references profiles(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  cue         text not null,
  created_at  timestamptz default now(),
  unique (trainer_id, exercise_id)
);

alter table exercise_custom_cues enable row level security;

create policy "Trainer manages own cues"
  on exercise_custom_cues
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 6. TRAINING CYCLES
--    A named program block (e.g. "Discovery Block", "Strength Phase 1").
-- ---------------------------------------------------------------------------
create table if not exists training_cycles (
  id              uuid primary key default gen_random_uuid(),
  trainer_id      uuid not null references profiles(id) on delete cascade,
  name            text not null,
  description     text,
  cover_photo_url text,
  num_days        int not null default 4,
  num_weeks       int not null default 4,
  is_template     boolean default false,
  tags            text[] default '{}',
  created_at      timestamptz default now()
);

alter table training_cycles enable row level security;

create policy "Trainer manages own cycles"
  on training_cycles
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

create policy "Client reads assigned cycles"
  on training_cycles for select
  using (
    exists (
      select 1 from client_cycle_assignments cca
      join clients c on c.id = cca.client_id
      where cca.cycle_id = training_cycles.id
        and c.profile_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 7. CLIENT CYCLE ASSIGNMENTS
--    Links a client to a training cycle with a status.
-- ---------------------------------------------------------------------------
create table if not exists client_cycle_assignments (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  cycle_id        uuid not null references training_cycles(id) on delete cascade,
  trainer_id      uuid not null references profiles(id) on delete cascade,
  status          text not null default 'active' check (status in ('active', 'completed', 'paused')),
  is_active       boolean default true,
  next_day_number int default 1,
  started_at      timestamptz,
  created_at      timestamptz default now()
);

alter table client_cycle_assignments enable row level security;

create policy "Trainer manages assignments"
  on client_cycle_assignments
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

create policy "Client reads own assignments"
  on client_cycle_assignments for select
  using (
    exists (
      select 1 from clients c
      where c.id = client_cycle_assignments.client_id
        and c.profile_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 8. WORKOUTS
--    One workout = one training day within a cycle.
-- ---------------------------------------------------------------------------
create table if not exists workouts (
  id          uuid primary key default gen_random_uuid(),
  cycle_id    uuid not null references training_cycles(id) on delete cascade,
  day_number  int not null,
  name        text not null,
  focus       text,
  created_at  timestamptz default now()
);

alter table workouts enable row level security;

create policy "Trainer manages workouts"
  on workouts
  using (
    exists (
      select 1 from training_cycles tc
      where tc.id = workouts.cycle_id
        and tc.trainer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from training_cycles tc
      where tc.id = workouts.cycle_id
        and tc.trainer_id = auth.uid()
    )
  );

create policy "Client reads assigned workouts"
  on workouts for select
  using (
    exists (
      select 1 from client_cycle_assignments cca
      join clients c on c.id = cca.client_id
      where cca.cycle_id = workouts.cycle_id
        and c.profile_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 9. WORKOUT EXERCISES
--    Ordered list of exercises within a workout day.
-- ---------------------------------------------------------------------------
create table if not exists workout_exercises (
  id            uuid primary key default gen_random_uuid(),
  workout_id    uuid not null references workouts(id) on delete cascade,
  exercise_id   uuid references exercises(id) on delete set null,
  position      int not null default 0,
  is_unilateral   boolean default false,
  per_side        boolean default false,
  superset_group  text default null,
  cue_override    text,
  notes           text,
  created_at      timestamptz default now()
);

alter table workout_exercises enable row level security;

create policy "Trainer manages workout exercises"
  on workout_exercises
  using (
    exists (
      select 1 from workouts w
      join training_cycles tc on tc.id = w.cycle_id
      where w.id = workout_exercises.workout_id
        and tc.trainer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from workouts w
      join training_cycles tc on tc.id = w.cycle_id
      where w.id = workout_exercises.workout_id
        and tc.trainer_id = auth.uid()
    )
  );

create policy "Client reads assigned workout exercises"
  on workout_exercises for select
  using (
    exists (
      select 1 from workouts w
      join client_cycle_assignments cca on cca.cycle_id = w.cycle_id
      join clients c on c.id = cca.client_id
      where w.id = workout_exercises.workout_id
        and c.profile_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 10. WORKOUT SET PRESCRIPTIONS
--     Set-level prescriptions authored by the trainer for each workout exercise.
-- ---------------------------------------------------------------------------
create table if not exists workout_set_prescriptions (
  id                   uuid primary key default gen_random_uuid(),
  workout_exercise_id  uuid not null references workout_exercises(id) on delete cascade,
  set_number           int not null,
  set_type             text not null default 'working'
                         check (set_type in ('warmup','working','backoff','drop','myorep','amrap','tempo','pause')),
  reps                 text,
  rpe_target           numeric,
  load_modifier        numeric,
  hold_seconds         int,
  tempo                text,
  cue                  text,
  created_at           timestamptz default now()
);

alter table workout_set_prescriptions enable row level security;

create policy "Trainer manages set prescriptions"
  on workout_set_prescriptions
  using (
    exists (
      select 1 from workout_exercises we
      join workouts w on w.id = we.workout_id
      join training_cycles tc on tc.id = w.cycle_id
      where we.id = workout_set_prescriptions.workout_exercise_id
        and tc.trainer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from workout_exercises we
      join workouts w on w.id = we.workout_id
      join training_cycles tc on tc.id = w.cycle_id
      where we.id = workout_set_prescriptions.workout_exercise_id
        and tc.trainer_id = auth.uid()
    )
  );

create policy "Client reads prescribed sets"
  on workout_set_prescriptions for select
  using (
    exists (
      select 1 from workout_exercises we
      join workouts w on w.id = we.workout_id
      join client_cycle_assignments cca on cca.cycle_id = w.cycle_id
      join clients c on c.id = cca.client_id
      where we.id = workout_set_prescriptions.workout_exercise_id
        and c.profile_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 11. SESSIONS
--     A logged training session — client's actual completion of a workout day.
-- ---------------------------------------------------------------------------
create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  trainer_id   uuid not null references profiles(id) on delete cascade,
  workout_id   uuid references workouts(id) on delete set null,
  cycle_id     uuid references training_cycles(id) on delete set null,
  started_at   timestamptz,
  completed_at timestamptz,
  duration_min int,
  notes        text,
  coach_notes  text,                    -- trainer feedback on the session
  rating       int check (rating between 1 and 5),
  created_at   timestamptz default now()
);

alter table sessions enable row level security;

create policy "Trainer manages sessions"
  on sessions
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

create policy "Client reads own sessions"
  on sessions for select
  using (
    exists (
      select 1 from clients c
      where c.id = sessions.client_id
        and c.profile_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 12. SESSION EXERCISES
--     Which exercises were performed in a session.
-- ---------------------------------------------------------------------------
create table if not exists session_exercises (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references sessions(id) on delete cascade,
  exercise_id         uuid not null references exercises(id) on delete cascade,
  workout_exercise_id uuid references workout_exercises(id) on delete set null,
  order_index         int not null default 0,
  notes               text,
  created_at          timestamptz default now()
);

alter table session_exercises enable row level security;

create policy "Trainer manages session exercises"
  on session_exercises
  using (
    exists (
      select 1 from sessions s
      where s.id = session_exercises.session_id
        and s.trainer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sessions s
      where s.id = session_exercises.session_id
        and s.trainer_id = auth.uid()
    )
  );

create policy "Client reads own session exercises"
  on session_exercises for select
  using (
    exists (
      select 1 from sessions s
      join clients c on c.id = s.client_id
      where s.id = session_exercises.session_id
        and c.profile_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 13. SESSION SETS (LOGGED)
--     Actual sets performed by the client during a session.
-- ---------------------------------------------------------------------------
create table if not exists session_sets (
  id                  uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references session_exercises(id) on delete cascade,
  prescribed_set_id   uuid references workout_set_prescriptions(id) on delete set null,
  set_number          int not null,
  reps_completed      int,
  weight_kg           numeric,
  rpe_actual          numeric,
  side                text check (side in ('left', 'right', 'both')),
  notes               text,
  created_at          timestamptz default now()
);

alter table session_sets enable row level security;

create policy "Trainer manages logged sets"
  on session_sets
  using (
    exists (
      select 1 from session_exercises se
      join sessions s on s.id = se.session_id
      where se.id = session_sets.session_exercise_id
        and s.trainer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from session_exercises se
      join sessions s on s.id = se.session_id
      where se.id = session_sets.session_exercise_id
        and s.trainer_id = auth.uid()
    )
  );

create policy "Client logs own sets"
  on session_sets
  using (
    exists (
      select 1 from session_exercises se
      join sessions s on s.id = se.session_id
      join clients c on c.id = s.client_id
      where se.id = session_sets.session_exercise_id
        and c.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from session_exercises se
      join sessions s on s.id = se.session_id
      join clients c on c.id = s.client_id
      where se.id = session_sets.session_exercise_id
        and c.profile_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 14. CHECK-INS
--     Weekly subjective check-in from client (mood, sleep, soreness, etc.)
-- ---------------------------------------------------------------------------
create table if not exists check_ins (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  trainer_id     uuid not null references profiles(id) on delete cascade,
  week_start     date not null,
  sleep_quality  int check (sleep_quality between 1 and 10),
  energy_level   int check (energy_level between 1 and 10),
  stress_level   int check (stress_level between 1 and 10),
  soreness_level int check (soreness_level between 1 and 10),
  motivation     int check (motivation between 1 and 10),
  notes          text,
  created_at     timestamptz default now()
);

alter table check_ins enable row level security;

create policy "Trainer reads client check-ins"
  on check_ins for select using (trainer_id = auth.uid());

create policy "Client manages own check-ins"
  on check_ins
  using (
    exists (select 1 from clients c where c.id = check_ins.client_id and c.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from clients c where c.id = check_ins.client_id and c.profile_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- 15. BODY MEASUREMENTS
--     Weight, body fat, circumference tracking.
-- ---------------------------------------------------------------------------
create table if not exists body_measurements (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  measured_at     date not null,
  weight_kg       numeric,
  body_fat_pct    numeric,
  muscle_mass_kg  numeric,
  chest_cm        numeric,
  waist_cm        numeric,
  hips_cm        numeric,
  thigh_cm        numeric,
  arm_cm          numeric,
  notes           text,
  created_at      timestamptz default now()
);

alter table body_measurements enable row level security;

create policy "Trainer reads client measurements"
  on body_measurements for select
  using (
    exists (select 1 from clients c where c.id = body_measurements.client_id and c.trainer_id = auth.uid())
  );

create policy "Client manages own measurements"
  on body_measurements
  using (
    exists (select 1 from clients c where c.id = body_measurements.client_id and c.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from clients c where c.id = body_measurements.client_id and c.profile_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- 16. PROGRESS PHOTOS
-- ---------------------------------------------------------------------------
create table if not exists progress_photos (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  photo_url   text not null,
  angle       text check (angle in ('front', 'back', 'side_left', 'side_right')),
  taken_at    date not null,
  notes       text,
  created_at  timestamptz default now()
);

alter table progress_photos enable row level security;

create policy "Trainer reads client photos"
  on progress_photos for select
  using (
    exists (select 1 from clients c where c.id = progress_photos.client_id and c.trainer_id = auth.uid())
  );

create policy "Client manages own photos"
  on progress_photos
  using (
    exists (select 1 from clients c where c.id = progress_photos.client_id and c.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from clients c where c.id = progress_photos.client_id and c.profile_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- 17. NUTRITION LOGS
-- ---------------------------------------------------------------------------
create table if not exists nutrition_logs (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  logged_date   date not null,
  calories      int,
  protein_g     numeric,
  carbs_g       numeric,
  fat_g         numeric,
  water_ml      int,
  notes         text,
  created_at    timestamptz default now()
);

alter table nutrition_logs enable row level security;

create policy "Trainer reads client nutrition"
  on nutrition_logs for select
  using (
    exists (select 1 from clients c where c.id = nutrition_logs.client_id and c.trainer_id = auth.uid())
  );

create policy "Client manages own nutrition"
  on nutrition_logs
  using (
    exists (select 1 from clients c where c.id = nutrition_logs.client_id and c.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from clients c where c.id = nutrition_logs.client_id and c.profile_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- 18. VAULT ITEMS
--     Resources (PDFs, videos, links) the trainer can share with clients.
-- ---------------------------------------------------------------------------
create table if not exists vault_items (
  id            uuid primary key default gen_random_uuid(),
  trainer_id    uuid not null references profiles(id) on delete cascade,
  title         text not null,
  description   text,
  type          text not null check (type in ('pdf', 'video', 'link', 'image', 'note')),
  url           text,
  content       text,
  thumbnail_url text,
  tags          text[],
  created_at    timestamptz default now()
);

alter table vault_items enable row level security;

create policy "Trainer manages own vault"
  on vault_items
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

create policy "Client reads shared vault items"
  on vault_items for select
  using (
    exists (
      select 1 from vault_client_access vca
      join clients c on c.id = vca.client_id
      where vca.vault_item_id = vault_items.id
        and c.profile_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 19. VAULT CLIENT ACCESS
--     Controls which clients can see which vault items.
-- ---------------------------------------------------------------------------
create table if not exists vault_client_access (
  id            uuid primary key default gen_random_uuid(),
  vault_item_id uuid not null references vault_items(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  granted_at    timestamptz default now(),
  unique (vault_item_id, client_id)
);

alter table vault_client_access enable row level security;

create policy "Trainer manages vault access"
  on vault_client_access
  using (
    exists (select 1 from vault_items vi where vi.id = vault_client_access.vault_item_id and vi.trainer_id = auth.uid())
  )
  with check (
    exists (select 1 from vault_items vi where vi.id = vault_client_access.vault_item_id and vi.trainer_id = auth.uid())
  );

create policy "Client reads own vault access"
  on vault_client_access for select
  using (
    exists (select 1 from clients c where c.id = vault_client_access.client_id and c.profile_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- 20. MESSAGES
--     Direct messaging between trainer and client.
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references profiles(id) on delete cascade,
  client_id    uuid not null references clients(id) on delete cascade,
  sender_role  text not null check (sender_role in ('trainer', 'client')),
  body         text not null,
  read_at      timestamptz,
  created_at   timestamptz default now()
);

alter table messages enable row level security;

create policy "Trainer manages own messages"
  on messages
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

create policy "Client manages own messages"
  on messages
  using (
    exists (select 1 from clients c where c.id = messages.client_id and c.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from clients c where c.id = messages.client_id and c.profile_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- 21. NOTIFICATIONS
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  data        jsonb,
  read_at     timestamptz,
  created_at  timestamptz default now()
);

alter table notifications enable row level security;

create policy "Users manage own notifications"
  on notifications
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 22. ANNOUNCEMENTS
--     Trainer broadcasts to all clients or a subset.
-- ---------------------------------------------------------------------------
create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references profiles(id) on delete cascade,
  title       text not null,
  body        text not null,
  pinned      boolean default false,
  created_at  timestamptz default now()
);

alter table announcements enable row level security;

create policy "Trainer manages own announcements"
  on announcements
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

create policy "Client reads trainer announcements"
  on announcements for select
  using (
    exists (
      select 1 from clients c
      where c.trainer_id = announcements.trainer_id
        and c.profile_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------------
-- 23. TRAINER ANALYTICS SNAPSHOTS
--     Cached weekly metrics for the trainer dashboard.
-- ---------------------------------------------------------------------------
create table if not exists trainer_analytics (
  id                    uuid primary key default gen_random_uuid(),
  trainer_id            uuid not null references profiles(id) on delete cascade,
  week_start            date not null,
  active_client_count   int default 0,
  sessions_completed    int default 0,
  avg_session_rating    numeric,
  check_ins_received    int default 0,
  messages_sent         int default 0,
  created_at            timestamptz default now(),
  unique (trainer_id, week_start)
);

alter table trainer_analytics enable row level security;

create policy "Trainer reads own analytics"
  on trainer_analytics for select using (trainer_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 24. TRAINING MAXES
--     Trainer-set 1RM / training max values per lift per client.
-- ---------------------------------------------------------------------------
create table if not exists training_maxes (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  trainer_id     uuid not null references profiles(id) on delete cascade,
  exercise_name  text not null,
  max_kg         numeric,
  updated_at     timestamptz default now(),
  created_at     timestamptz default now(),
  unique (client_id, exercise_name)
);

alter table training_maxes enable row level security;

create policy "Trainer manages client maxes"
  on training_maxes
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

create policy "Client reads own maxes"
  on training_maxes for select
  using (
    exists (select 1 from clients c where c.id = training_maxes.client_id and c.profile_id = auth.uid())
  );


-- ---------------------------------------------------------------------------
-- SCHEMA RELOAD (PostgREST)
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
