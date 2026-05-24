
-- Balances table
create table public.ai_credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_remaining int not null default 0,
  monthly_granted int not null default 0,
  daily_remaining int not null default 0,
  daily_granted int not null default 0,
  period_start timestamptz not null default now(),
  last_daily_reset date not null default current_date,
  updated_at timestamptz not null default now()
);

alter table public.ai_credit_balances enable row level security;

create policy "Users view own credit balance"
  on public.ai_credit_balances for select
  using (auth.uid() = user_id);

create policy "Service role manages credit balances"
  on public.ai_credit_balances for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Ledger table
create table public.ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  amount int not null,
  reason text not null,
  daily_after int not null default 0,
  monthly_after int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_ai_credit_ledger_user_created on public.ai_credit_ledger(user_id, created_at desc);

alter table public.ai_credit_ledger enable row level security;

create policy "Users view own credit ledger"
  on public.ai_credit_ledger for select
  using (auth.uid() = user_id);

create policy "Service role manages credit ledger"
  on public.ai_credit_ledger for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Plan -> grant mapping
create or replace function public.ai_credit_plan_grant(p_plan text)
returns table(monthly int, daily int)
language sql immutable
set search_path = public
as $$
  select
    case p_plan
      when 'starter'   then 120
      when 'pro'       then 300
      when 'scale'     then 700
      when 'business'  then 2000
      else 0
    end as monthly,
    case p_plan
      when 'free_beta' then 6
      else 0
    end as daily;
$$;

-- Grant credits for a user based on current plan
create or replace function public.grant_ai_credits(p_user uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_plan text;
  v_monthly int;
  v_daily int;
begin
  select plan::text into v_plan from public.profiles where id = p_user;
  if v_plan is null then v_plan := 'free_beta'; end if;

  select monthly, daily into v_monthly, v_daily
    from public.ai_credit_plan_grant(v_plan);

  insert into public.ai_credit_balances (
    user_id, monthly_remaining, monthly_granted,
    daily_remaining, daily_granted, period_start, last_daily_reset
  ) values (
    p_user, v_monthly, v_monthly, v_daily, v_daily, now(), current_date
  )
  on conflict (user_id) do update
    set monthly_remaining = v_monthly,
        monthly_granted   = v_monthly,
        daily_granted     = v_daily,
        period_start      = now(),
        updated_at        = now();
end;
$$;

-- Consume credits
create or replace function public.consume_ai_credits(
  p_user uuid,
  p_amount int,
  p_reason text,
  p_project uuid default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  bal public.ai_credit_balances%rowtype;
  v_plan text;
  v_monthly int;
  v_daily int;
  v_take_daily int;
  v_take_monthly int;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', true, 'daily_remaining', 0, 'monthly_remaining', 0);
  end if;

  -- ensure row exists
  perform public.grant_ai_credits(p_user)
    where not exists (select 1 from public.ai_credit_balances where user_id = p_user);

  select * into bal from public.ai_credit_balances where user_id = p_user for update;

  -- daily reset
  if bal.last_daily_reset < current_date then
    select plan::text into v_plan from public.profiles where id = p_user;
    if v_plan is null then v_plan := 'free_beta'; end if;
    select daily into v_daily from public.ai_credit_plan_grant(v_plan);
    bal.daily_remaining := v_daily;
    bal.daily_granted   := v_daily;
    bal.last_daily_reset := current_date;
  end if;

  -- monthly reset (30 days)
  if bal.period_start + interval '30 days' <= now() then
    select plan::text into v_plan from public.profiles where id = p_user;
    if v_plan is null then v_plan := 'free_beta'; end if;
    select monthly into v_monthly from public.ai_credit_plan_grant(v_plan);
    bal.monthly_remaining := v_monthly;
    bal.monthly_granted   := v_monthly;
    bal.period_start      := now();
  end if;

  if (bal.daily_remaining + bal.monthly_remaining) < p_amount then
    update public.ai_credit_balances
      set daily_remaining   = bal.daily_remaining,
          daily_granted     = bal.daily_granted,
          monthly_remaining = bal.monthly_remaining,
          monthly_granted   = bal.monthly_granted,
          period_start      = bal.period_start,
          last_daily_reset  = bal.last_daily_reset,
          updated_at        = now()
      where user_id = p_user;
    return jsonb_build_object(
      'ok', false,
      'daily_remaining', bal.daily_remaining,
      'monthly_remaining', bal.monthly_remaining
    );
  end if;

  v_take_daily := least(bal.daily_remaining, p_amount);
  v_take_monthly := p_amount - v_take_daily;

  bal.daily_remaining   := bal.daily_remaining - v_take_daily;
  bal.monthly_remaining := bal.monthly_remaining - v_take_monthly;

  update public.ai_credit_balances
    set daily_remaining   = bal.daily_remaining,
        daily_granted     = bal.daily_granted,
        monthly_remaining = bal.monthly_remaining,
        monthly_granted   = bal.monthly_granted,
        period_start      = bal.period_start,
        last_daily_reset  = bal.last_daily_reset,
        updated_at        = now()
    where user_id = p_user;

  insert into public.ai_credit_ledger (user_id, project_id, amount, reason, daily_after, monthly_after)
    values (p_user, p_project, p_amount, p_reason, bal.daily_remaining, bal.monthly_remaining);

  return jsonb_build_object(
    'ok', true,
    'daily_remaining', bal.daily_remaining,
    'monthly_remaining', bal.monthly_remaining
  );
end;
$$;

-- Trigger: refill on plan change
create or replace function public.handle_profile_plan_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.plan is distinct from old.plan then
    perform public.grant_ai_credits(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_plan_change on public.profiles;
create trigger trg_profile_plan_change
  after update of plan on public.profiles
  for each row execute function public.handle_profile_plan_change();

-- Trigger: grant on profile insert (covers new signups)
create or replace function public.handle_profile_insert_credits()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.grant_ai_credits(new.id);
  return new;
end;
$$;

drop trigger if exists trg_profile_insert_credits on public.profiles;
create trigger trg_profile_insert_credits
  after insert on public.profiles
  for each row execute function public.handle_profile_insert_credits();

-- Backfill existing users
do $$
declare r record;
begin
  for r in select id from public.profiles loop
    perform public.grant_ai_credits(r.id);
  end loop;
end $$;
