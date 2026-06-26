create table if not exists knowledge_mutation_reviews (
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

create index if not exists idx_mutation_reviews_base_status
  on knowledge_mutation_reviews(knowledge_base_id, status, updated_at desc);
