alter table build_versions
  add column if not exists design_usage_plan jsonb;

create index if not exists idx_build_versions_design_usage_plan
  on build_versions using gin (design_usage_plan);
