alter table harness_runs
  add column if not exists observability_events jsonb not null default '[]';
