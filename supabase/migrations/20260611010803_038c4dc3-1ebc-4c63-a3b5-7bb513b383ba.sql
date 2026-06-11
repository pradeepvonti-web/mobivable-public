
CREATE OR REPLACE FUNCTION public.refund_ai_credits(
  p_user uuid,
  p_amount integer,
  p_reason text,
  p_project uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  bal public.ai_credit_balances%rowtype;
  v_to_daily int;
  v_to_monthly int;
  v_remaining int;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', true, 'refunded', 0);
  end if;

  select * into bal from public.ai_credit_balances where user_id = p_user for update;
  if not found then
    -- nothing to refund into; create a fresh balance and bail
    perform public.grant_ai_credits(p_user);
    return jsonb_build_object('ok', true, 'refunded', 0, 'note', 'no_prior_balance');
  end if;

  -- Refill daily bucket first (up to daily_granted), then monthly (up to monthly_granted)
  v_to_daily := least(p_amount, greatest(bal.daily_granted - bal.daily_remaining, 0));
  v_remaining := p_amount - v_to_daily;
  v_to_monthly := least(v_remaining, greatest(bal.monthly_granted - bal.monthly_remaining, 0));

  bal.daily_remaining   := bal.daily_remaining + v_to_daily;
  bal.monthly_remaining := bal.monthly_remaining + v_to_monthly;

  update public.ai_credit_balances
     set daily_remaining   = bal.daily_remaining,
         monthly_remaining = bal.monthly_remaining,
         updated_at        = now()
   where user_id = p_user;

  insert into public.ai_credit_ledger (user_id, project_id, amount, reason, daily_after, monthly_after)
    values (p_user, p_project, -(v_to_daily + v_to_monthly), 'refund:' || p_reason, bal.daily_remaining, bal.monthly_remaining);

  return jsonb_build_object(
    'ok', true,
    'refunded', v_to_daily + v_to_monthly,
    'daily_remaining', bal.daily_remaining,
    'monthly_remaining', bal.monthly_remaining
  );
end;
$$;
