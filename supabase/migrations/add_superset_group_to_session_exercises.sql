-- Add superset_group to session_exercises so the program's superset
-- structure carries over into live sessions and can also be changed
-- on the fly during a session.
alter table session_exercises
  add column if not exists superset_group text;
