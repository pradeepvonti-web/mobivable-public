create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  content text not null default '',
  file_url text,
  file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.knowledge_items enable row level security;

create policy "own_select_knowledge" on public.knowledge_items
  for select to authenticated using (auth.uid() = user_id);
create policy "own_insert_knowledge" on public.knowledge_items
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own_update_knowledge" on public.knowledge_items
  for update to authenticated using (auth.uid() = user_id);
create policy "own_delete_knowledge" on public.knowledge_items
  for delete to authenticated using (auth.uid() = user_id);

create trigger knowledge_items_set_updated_at
  before update on public.knowledge_items
  for each row execute function public.set_updated_at();

create index knowledge_items_user_updated_idx
  on public.knowledge_items(user_id, updated_at desc);