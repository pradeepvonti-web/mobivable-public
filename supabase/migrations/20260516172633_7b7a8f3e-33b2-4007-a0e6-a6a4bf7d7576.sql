create table public.user_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  label text not null,
  token text not null default '',
  account text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_connectors enable row level security;

DROP POLICY IF EXISTS "own_select_connectors" ON public.user_connectors;
create policy "own_select_connectors" on public.user_connectors
  for select to authenticated using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_connectors" ON public.user_connectors;
create policy "own_insert_connectors" on public.user_connectors
  for insert to authenticated with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_connectors" ON public.user_connectors;
create policy "own_update_connectors" on public.user_connectors
  for update to authenticated using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_connectors" ON public.user_connectors;
create policy "own_delete_connectors" on public.user_connectors
  for delete to authenticated using (auth.uid() = user_id);

create trigger user_connectors_set_updated_at
  before update on public.user_connectors
  for each row execute function public.set_updated_at();

create index user_connectors_user_updated_idx
  on public.user_connectors(user_id, updated_at desc);