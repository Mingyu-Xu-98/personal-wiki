-- Bridge table used while Studio migrates from local JSON files to normalized PostgreSQL repositories.
-- It lets alpha deployments back up and inspect the exact local state before the runtime store is switched.

create table if not exists studio_state_snapshots (
  id text primary key,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_studio_state_snapshots_kind_created
  on studio_state_snapshots(kind, created_at desc);
