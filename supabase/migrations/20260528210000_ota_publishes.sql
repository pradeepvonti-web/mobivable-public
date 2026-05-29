-- OTA publish history per project + channel.
--
-- "Channel" is Expo's terminology — a named bucket of updates the
-- shipped app subscribes to. Most apps end up with at least:
--   - preview      (TestFlight / internal track / dev devices)
--   - production   (App Store / Play Store users)
-- Free-form text in the column so users can add `staging`, `beta-2026`,
-- etc. without a migration.
--
-- Each row records ONE publish attempt. The status flow mirrors the
-- store-submissions table for consistency:
--   queued -> in_progress -> succeeded | failed | cancelled
--
-- `expo_update_group_id` is the id EAS Update assigns to the bundle
-- group once the publish lands; it's surfaced back in the UI as a deep
-- link to the EAS dashboard. Null until a future submit-runner worker
-- actually executes `eas update` and writes it back.
--
-- The EAS project id + owner (Expo username) live on `project_env_vars`
-- (variable names EAS_PROJECT_ID + EAS_OWNER). They aren't sensitive —
-- both are public in every built app's runtime URL — so storing them
-- alongside other env vars keeps the surface area small.

CREATE TABLE IF NOT EXISTS public.ota_publishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel ~ '^[a-z][a-z0-9_-]{0,40}$'),
  /** User-supplied release note shown in the EAS dashboard + in the
   *  studio's publish history. Capped at 4 KB. */
  message text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','in_progress','succeeded','failed','cancelled')),
  error_text text,
  /** EAS Update group id once the publish lands. */
  expo_update_group_id text,
  /** runtimeVersion that matched at publish time — copying it down
   *  means we can audit "which native build will receive this update"
   *  without having to look up the project's current export. */
  runtime_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS ota_publishes_project_idx
  ON public.ota_publishes (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ota_publishes_user_idx
  ON public.ota_publishes (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_ota_publish() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ota_publish ON public.ota_publishes;
CREATE TRIGGER trg_touch_ota_publish
  BEFORE UPDATE ON public.ota_publishes
  FOR EACH ROW EXECUTE FUNCTION public.touch_ota_publish();

ALTER TABLE public.ota_publishes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_ota_publishes_all" ON public.ota_publishes;
CREATE POLICY "own_ota_publishes_all" ON public.ota_publishes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
