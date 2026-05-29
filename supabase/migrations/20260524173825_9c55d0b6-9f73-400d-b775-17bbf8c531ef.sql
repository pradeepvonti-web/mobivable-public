
create table if not exists public.eas_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  eas_app_id text not null,
  eas_account_name text not null,
  eas_slug text not null,
  expo_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

alter table public.eas_apps enable row level security;

DROP POLICY IF EXISTS "eas_apps_select_own" ON public.eas_apps;
create policy "eas_apps_select_own" on public.eas_apps
  for select using (auth.uid() = user_id);
DROP POLICY IF EXISTS "eas_apps_insert_own" ON public.eas_apps;
create policy "eas_apps_insert_own" on public.eas_apps
  for insert with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "eas_apps_update_own" ON public.eas_apps;
create policy "eas_apps_update_own" on public.eas_apps
  for update using (auth.uid() = user_id);
DROP POLICY IF EXISTS "eas_apps_delete_own" ON public.eas_apps;
create policy "eas_apps_delete_own" on public.eas_apps
  for delete using (auth.uid() = user_id);

create trigger eas_apps_set_updated_at
  before update on public.eas_apps
  for each row execute function public.set_updated_at();

create table if not exists public.eas_builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  eas_app_id text not null,
  eas_build_id text,
  platform text not null check (platform in ('android', 'ios')),
  profile text not null default 'preview',
  status text not null default 'pending',
  artifact_url text,
  logs_url text,
  error_text text,
  archive_url text,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eas_builds_project_idx on public.eas_builds(project_id, created_at desc);

alter table public.eas_builds enable row level security;

DROP POLICY IF EXISTS "eas_builds_select_own" ON public.eas_builds;
create policy "eas_builds_select_own" on public.eas_builds
  for select using (auth.uid() = user_id);
DROP POLICY IF EXISTS "eas_builds_insert_own" ON public.eas_builds;
create policy "eas_builds_insert_own" on public.eas_builds
  for insert with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "eas_builds_update_own" ON public.eas_builds;
create policy "eas_builds_update_own" on public.eas_builds
  for update using (auth.uid() = user_id);
DROP POLICY IF EXISTS "eas_builds_delete_own" ON public.eas_builds;
create policy "eas_builds_delete_own" on public.eas_builds
  for delete using (auth.uid() = user_id);

create trigger eas_builds_set_updated_at
  before update on public.eas_builds
  for each row execute function public.set_updated_at();
