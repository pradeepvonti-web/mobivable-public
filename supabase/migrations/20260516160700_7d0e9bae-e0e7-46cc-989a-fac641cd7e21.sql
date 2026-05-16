create table public.project_env_vars (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  name text not null,
  value text not null default '',
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id, name)
);

create index project_env_vars_project_idx on public.project_env_vars(project_id);

alter table public.project_env_vars enable row level security;

create policy "Users read own env vars"
  on public.project_env_vars for select
  using (auth.uid() = user_id);

create policy "Users insert own env vars"
  on public.project_env_vars for insert
  with check (auth.uid() = user_id);

create policy "Users update own env vars"
  on public.project_env_vars for update
  using (auth.uid() = user_id);

create policy "Users delete own env vars"
  on public.project_env_vars for delete
  using (auth.uid() = user_id);

create trigger project_env_vars_set_updated_at
before update on public.project_env_vars
for each row execute function public.set_updated_at();