
-- Grant initial credits on new profile
DROP TRIGGER IF EXISTS trg_profiles_insert_credits ON public.profiles;
CREATE TRIGGER trg_profiles_insert_credits
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_profile_insert_credits();

-- Reset credits whenever plan changes
DROP TRIGGER IF EXISTS trg_profiles_plan_change ON public.profiles;
CREATE TRIGGER trg_profiles_plan_change
AFTER UPDATE OF plan ON public.profiles
FOR EACH ROW
WHEN (NEW.plan IS DISTINCT FROM OLD.plan)
EXECUTE FUNCTION public.handle_profile_plan_change();

-- Sync profile.plan from subscription rows (handles purchase, upgrade, end-of-period downgrade)
DROP TRIGGER IF EXISTS trg_subscriptions_sync_plan ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_sync_plan
AFTER INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_plan_from_subscription();
