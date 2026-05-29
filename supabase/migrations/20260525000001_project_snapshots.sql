create table if not exists project_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  label text not null default 'Auto-save',
  schema jsonb not null,
  visual_edits jsonb,
  source text not null default 'auto',
  element_count integer default 0,
  screen_count integer default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_snapshots_project on project_snapshots(project_id, created_at desc);
alter table project_snapshots enable row level security;
DROP POLICY IF EXISTS "Users can view own project snapshots" ON project_snapshots;
create policy "Users can view own project snapshots" on project_snapshots for select using (
  user_id = auth.uid()
);
DROP POLICY IF EXISTS "Users can insert own snapshots" ON project_snapshots;
create policy "Users can insert own snapshots" on project_snapshots for insert with check (
  user_id = auth.uid()
);
DROP POLICY IF EXISTS "Users can delete own snapshots" ON project_snapshots;
create policy "Users can delete own snapshots" on project_snapshots for delete using (
  user_id = auth.uid()
);
