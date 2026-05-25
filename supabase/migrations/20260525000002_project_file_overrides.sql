create table if not exists project_file_overrides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  file_path text not null,
  content text not null,
  updated_at timestamptz not null default now(),
  unique(project_id, file_path)
);
alter table project_file_overrides enable row level security;
create policy "Users can manage own file overrides" on project_file_overrides for all using (
  user_id = auth.uid()
);
