alter table build_versions
  add column if not exists site_workspace jsonb,
  add column if not exists site_graph jsonb,
  add column if not exists patch_plan jsonb;

create index if not exists idx_build_versions_site_graph
  on build_versions using gin (site_graph);
