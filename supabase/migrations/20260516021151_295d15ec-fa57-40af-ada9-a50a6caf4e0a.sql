-- Map a price_id (human-readable external id) to a plan_tier
create or replace function public.plan_from_price(p_price_id text)
returns public.plan_tier
language sql
immutable
set search_path = public
as $$
  select case
    when p_price_id like 'starter_%' then 'starter'::public.plan_tier
    when p_price_id like 'pro_%'     then 'pro'::public.plan_tier
    else null
  end;
$$;

-- Sync profile.plan from a subscription row's status + price + period_end
create or replace function public.sync_profile_plan_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plan_tier;
  v_has_access boolean;
begin
  v_plan := public.plan_from_price(new.price_id);
  if v_plan is null then
    return new;
  end if;

  v_has_access :=
    (new.status in ('active', 'trialing', 'past_due')
      and (new.current_period_end is null or new.current_period_end > now()))
    or (new.status = 'canceled'
      and new.current_period_end is not null
      and new.current_period_end > now());

  if v_has_access then
    update public.profiles
       set plan = v_plan,
           updated_at = now()
     where id = new.user_id
       and plan is distinct from v_plan;
  else
    -- canceled & period over: downgrade to free_beta
    update public.profiles
       set plan = 'free_beta',
           updated_at = now()
     where id = new.user_id
       and plan = v_plan;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_plan on public.subscriptions;
create trigger trg_sync_profile_plan
after insert or update on public.subscriptions
for each row execute function public.sync_profile_plan_from_subscription();

-- Sweep: downgrade users whose canceled subscriptions have expired
create or replace function public.sweep_expired_subscriptions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
     set plan = 'free_beta', updated_at = now()
   where p.plan in ('starter', 'pro')
     and not exists (
       select 1 from public.subscriptions s
        where s.user_id = p.id
          and (
            (s.status in ('active', 'trialing', 'past_due')
              and (s.current_period_end is null or s.current_period_end > now()))
            or (s.status = 'canceled'
              and s.current_period_end is not null
              and s.current_period_end > now())
          )
     );
end;
$$;

-- Nightly cron
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('sweep-expired-subscriptions');
exception when others then null;
end $$;
select cron.schedule(
  'sweep-expired-subscriptions',
  '17 3 * * *',
  $$select public.sweep_expired_subscriptions();$$
);