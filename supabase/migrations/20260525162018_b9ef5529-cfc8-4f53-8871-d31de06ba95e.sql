create table if not exists public.project_snapshots (
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
create index if not exists idx_snapshots_project on public.project_snapshots(project_id, created_at desc);
alter table public.project_snapshots enable row level security;
create policy "Users can view own project snapshots" on public.project_snapshots for select using (user_id = auth.uid());
create policy "Users can insert own snapshots" on public.project_snapshots for insert with check (user_id = auth.uid());
create policy "Users can delete own snapshots" on public.project_snapshots for delete using (user_id = auth.uid());

create table if not exists public.project_file_overrides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  file_path text not null,
  content text not null,
  updated_at timestamptz not null default now(),
  unique(project_id, file_path)
);
alter table public.project_file_overrides enable row level security;
create policy "Users can manage own file overrides" on public.project_file_overrides for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.project_secrets (
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
alter table public.project_secrets enable row level security;
create policy "Users can manage own project secrets" on public.project_secrets for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.app_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null,
  tags text[] default '{}',
  preview_image_url text,
  schema jsonb not null,
  feature_list text[] default '{}',
  author_id uuid,
  is_featured boolean default false,
  is_community boolean default false,
  use_count integer default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_templates_category on public.app_templates(category);
alter table public.app_templates enable row level security;
create policy "Anyone can view templates" on public.app_templates for select using (true);
create policy "Auth users can insert templates" on public.app_templates for insert with check (auth.uid() is not null);