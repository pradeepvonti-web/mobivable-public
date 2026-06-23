-- Allow the demo user (demo@mobivable.com) to create up to 10 apps
-- while keeping existing plan-based quotas for all other users.

CREATE OR REPLACE FUNCTION public.enforce_project_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_plan  text;
  v_quota int;
  v_used  int;
  v_email text;
begin
  -- Look up the user's email to check for demo account
  select email into v_email from auth.users where id = new.user_id;

  -- Demo user gets a special quota of 10 apps
  if v_email = 'demo@mobivable.com' then
    select count(*) into v_used from public.projects where user_id = new.user_id;
    if v_used >= 10 then
      raise exception 'APP_QUOTA_EXCEEDED: Demo account allows 10 app(s). Sign up for your own account to create more.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Standard plan-based quota for all other users
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
