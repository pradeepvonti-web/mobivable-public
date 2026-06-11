
-- 1. Force every new signup onto free_beta regardless of raw_user_meta_data.plan
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, display_name, plan)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    'free_beta'::public.plan_tier
  );
  return new;
end;
$function$;

-- 2. Treat past_due as active so the user keeps access during Stripe retries
CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'live'::text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.subscriptions
    where user_id = user_uuid
    and environment = check_env
    and (
      (status in ('active', 'trialing', 'past_due')
        and (current_period_end is null or current_period_end > now()))
      or (status = 'canceled' and current_period_end > now())
    )
  );
$function$;

-- 3. Mirror past-due into the sweep so we don't auto-downgrade past_due users
CREATE OR REPLACE FUNCTION public.sync_profile_plan_from_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
       set plan = v_plan, updated_at = now()
     where id = new.user_id and plan is distinct from v_plan;
  else
    update public.profiles
       set plan = 'free_beta', updated_at = now()
     where id = new.user_id and plan = v_plan;
  end if;

  return new;
end;
$function$;

-- 4. App-quota check used by project creation
CREATE OR REPLACE FUNCTION public.plan_app_quota(p_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  select case p_plan
    when 'free_beta' then 1
    when 'starter'   then 5
    when 'pro'       then -1   -- -1 = unlimited
    when 'scale'     then -1
    when 'business'  then -1
    else 1
  end;
$function$;

CREATE OR REPLACE FUNCTION public.can_create_project(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_plan text;
  v_quota int;
  v_used int;
begin
  select plan::text into v_plan from public.profiles where id = p_user;
  if v_plan is null then v_plan := 'free_beta'; end if;
  v_quota := public.plan_app_quota(v_plan);
  select count(*) into v_used from public.projects where user_id = p_user;
  if v_quota < 0 then
    return jsonb_build_object('ok', true, 'plan', v_plan, 'used', v_used, 'quota', null);
  end if;
  return jsonb_build_object(
    'ok', v_used < v_quota,
    'plan', v_plan,
    'used', v_used,
    'quota', v_quota
  );
end;
$function$;

-- 5. Enforce via trigger so client-side bypass is impossible
CREATE OR REPLACE FUNCTION public.enforce_project_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_plan text;
  v_quota int;
  v_used int;
begin
  select plan::text into v_plan from public.profiles where id = new.user_id;
  if v_plan is null then v_plan := 'free_beta'; end if;
  v_quota := public.plan_app_quota(v_plan);
  if v_quota < 0 then
    return new;
  end if;
  select count(*) into v_used from public.projects where user_id = new.user_id;
  if v_used >= v_quota then
    raise exception 'APP_QUOTA_EXCEEDED: Your % plan allows % app(s). Upgrade to create more.', v_plan, v_quota
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_projects_enforce_quota ON public.projects;
CREATE TRIGGER trg_projects_enforce_quota
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_project_quota();
