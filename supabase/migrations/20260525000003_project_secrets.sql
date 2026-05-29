create table if not exists project_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  key_name text not null,
  encrypted_value text not null,
  category text not null default 'custom',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, key_name)
);
alter table project_secrets enable row level security;
DROP POLICY IF EXISTS "Users can manage own project secrets" ON project_secrets;
create policy "Users can manage own project secrets" on project_secrets for all using (
  user_id = auth.uid()
);
