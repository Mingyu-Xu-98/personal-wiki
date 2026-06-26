-- Personal Wiki Harness production schema draft.
-- This is the target shape for moving Studio from local JSON to PostgreSQL.

create table users (
  id text primary key,
  email text not null unique,
  name text not null,
  role text not null default 'user',
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table knowledge_bases (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  description text not null default '',
  wiki_index text not null default '',
  file_count integer not null default 0,
  total_chars integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table source_documents (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  title text not null,
  uri text not null,
  media_type text not null,
  content_hash text not null,
  content_mode text not null default 'inline',
  content text,
  object_key text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  extracted_at timestamptz
);

create table wiki_pages (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  kind text not null,
  title text not null,
  path text not null,
  body text not null,
  source_ids jsonb not null default '[]',
  entity_ids jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table wiki_entities (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  name text not null,
  kind text not null,
  aliases jsonb not null default '[]',
  summary text not null,
  page_id text,
  source_ids jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table wiki_relations (
  id text primary key,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  from_entity_id text not null,
  to_entity_id text not null,
  predicate text not null,
  confidence numeric not null default 0,
  evidence_source_ids jsonb not null default '[]',
  note text not null default ''
);

create table knowledge_mutation_reviews (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  plan_id text not null,
  status text not null,
  source jsonb not null,
  mutation_plan jsonb not null,
  review jsonb not null,
  model_backed boolean not null default false,
  rejected_candidate_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decided_at timestamptz
);

create table build_jobs (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  kind text not null default 'site-build',
  status text not null,
  intent jsonb not null,
  attempt integer not null default 1,
  queue_position integer not null default 0,
  run_id text,
  version_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table harness_runs (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  state text not null,
  intent jsonb not null,
  context_ledger jsonb,
  plan jsonb,
  commander_decisions jsonb not null default '[]',
  sub_agent_traces jsonb not null default '[]',
  observability_events jsonb not null default '[]',
  reflection jsonb,
  error text,
  created_at timestamptz not null default now()
);

create table build_versions (
  id text primary key,
  run_id text not null references harness_runs(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  knowledge_base_id text not null references knowledge_bases(id) on delete cascade,
  parent_version_id text,
  summary text not null,
  content_model jsonb not null,
  design_usage_plan jsonb,
  site_plan jsonb not null,
  site_artifact jsonb,
  site_workspace jsonb,
  site_graph jsonb,
  patch_plan jsonb,
  run_context_manifest jsonb,
  lint_issues jsonb not null default '[]',
  change_summary text,
  created_at timestamptz not null default now()
);

create table build_logs (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  job_id text not null references build_jobs(id) on delete cascade,
  run_id text,
  phase text not null,
  level text not null,
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

create table published_sites (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  version_id text not null references build_versions(id) on delete cascade,
  run_id text not null references harness_runs(id) on delete cascade,
  version_number integer not null,
  title text not null,
  summary text not null,
  status text not null default 'published',
  deployment jsonb,
  parent_version_id text,
  change_summary text,
  created_at timestamptz not null,
  published_at timestamptz not null default now()
);

create table usage_records (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  kind text not null,
  quantity numeric not null,
  cost_units numeric not null,
  model text,
  ref_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_sources_base on source_documents(knowledge_base_id);
create index idx_mutation_reviews_base_status on knowledge_mutation_reviews(knowledge_base_id, status, updated_at desc);
create index idx_build_jobs_user_status on build_jobs(user_id, status, created_at desc);
create index idx_build_logs_job on build_logs(job_id, created_at);
create index idx_versions_user_created on build_versions(user_id, created_at desc);
create index idx_usage_user_created on usage_records(user_id, created_at desc);
