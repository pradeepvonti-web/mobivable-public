-- Native capabilities catalog — per-project record of which platform
-- features the user (or the agent) has wired in.
--
-- Stored as a jsonb array on the project row:
--   [
--     {
--       "id": "push_notifications",
--       "config": { "apns_team_id": "ABCD123", ... },
--       "added_at": "2026-05-28T12:00:00Z",
--       "added_by": "agent" | "user"
--     },
--     ...
--   ]
--
-- The Expo exporter reads this column at zip time and injects the right
-- dependencies, app.json plugins, Info.plist permission strings, and
-- AndroidManifest permissions. Keeping the catalog as data (rather than
-- hard-wiring it into export-expo.functions.ts) lets the agent add new
-- capabilities without any code changes — the catalog file owns the
-- "what gets emitted" spec.
--
-- Default '[]' so existing projects don't need a backfill.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS native_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Lightweight check so a future schema bump can rely on the shape.
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_native_capabilities_is_array;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_native_capabilities_is_array
  CHECK (jsonb_typeof(native_capabilities) = 'array');
