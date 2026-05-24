
create or replace function public.plan_from_price(p_price_id text)
returns plan_tier
language sql immutable
set search_path = public
as $$
  select case
    when p_price_id like 'starter_%'  then 'starter'::public.plan_tier
    when p_price_id like 'pro_%'      then 'pro'::public.plan_tier
    when p_price_id like 'scale_%'    then 'scale'::public.plan_tier
    when p_price_id like 'business_%' then 'business'::public.plan_tier
    else null
  end;
$$;
