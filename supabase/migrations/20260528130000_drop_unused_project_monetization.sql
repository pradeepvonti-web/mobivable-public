-- Drop the unused `project_monetization` table.
--
-- It was created by 20260524171340_*.sql with admob-specific columns
-- (banner/interstitial/rewarded × iOS/Android), but the MonetizationPanel
-- (src/components/MonetizationPanel.tsx) ignores it entirely — it writes
-- every monetization key to `project_env_vars` instead, including
-- `monetization_provider` and `monetization_model`. The downstream consumer
-- (generateMonetizationLib in src/lib/export-project.ts) also expects the
-- env-var path.
--
-- Verified before drop: zero rows in production, zero writers in src/.
-- Only references were the migration itself and the auto-generated
-- supabase types.ts (which `supabase gen types` will refresh after this
-- migration is applied).
--
-- CASCADE removes the dependent index, trigger, and 4 RLS policies in one
-- statement; IF EXISTS makes the migration idempotent on re-apply.

DROP TABLE IF EXISTS public.project_monetization CASCADE;
