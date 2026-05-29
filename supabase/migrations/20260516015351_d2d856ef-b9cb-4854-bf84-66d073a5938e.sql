
-- Plan tier enum
create type public.plan_tier as enum ('free_beta', 'starter', 'pro');

-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan public.plan_tier not null default 'free_beta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup, reading plan + display_name from raw_user_meta_data
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_plan public.plan_tier;
begin
  begin
    selected_plan := coalesce(
      (new.raw_user_meta_data ->> 'plan')::public.plan_tier,
      'free_beta'::public.plan_tier
    );
  exception when others then
    selected_plan := 'free_beta';
  end;

  insert into public.profiles (id, display_name, plan)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    selected_plan
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
