
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  status text not null default 'pending',
  selected_roles text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  role text not null,
  ordinal int not null default 0,
  status text not null default 'waiting',
  output text,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index on public.agent_runs(project_id, created_at desc);
create index on public.agent_tasks(run_id, ordinal);
create index on public.agent_messages(run_id, created_at);

alter table public.agent_runs enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.agent_messages enable row level security;

DROP POLICY IF EXISTS "own_select_runs" ON public.agent_runs;
create policy "own_select_runs" on public.agent_runs for select using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_runs" ON public.agent_runs;
create policy "own_insert_runs" on public.agent_runs for insert with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_runs" ON public.agent_runs;
create policy "own_update_runs" on public.agent_runs for update using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_runs" ON public.agent_runs;
create policy "own_delete_runs" on public.agent_runs for delete using (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_select_tasks" ON public.agent_tasks;
create policy "own_select_tasks" on public.agent_tasks for select using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_tasks" ON public.agent_tasks;
create policy "own_insert_tasks" on public.agent_tasks for insert with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_tasks" ON public.agent_tasks;
create policy "own_update_tasks" on public.agent_tasks for update using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_tasks" ON public.agent_tasks;
create policy "own_delete_tasks" on public.agent_tasks for delete using (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_select_msgs" ON public.agent_messages;
create policy "own_select_msgs" on public.agent_messages for select using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_msgs" ON public.agent_messages;
create policy "own_insert_msgs" on public.agent_messages for insert with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_msgs" ON public.agent_messages;
create policy "own_delete_msgs" on public.agent_messages for delete using (auth.uid() = user_id);

create trigger trg_agent_runs_updated before update on public.agent_runs
  for each row execute function public.set_updated_at();
create trigger trg_agent_tasks_updated before update on public.agent_tasks
  for each row execute function public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agent_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_tasks;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agent_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agent_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_runs;
  END IF;
END $$;
