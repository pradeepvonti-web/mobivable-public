-- Phase 1 of the Maestro Cloud integration. Adds tracking columns to
-- eas_test_runs so the trigger → GitHub Actions → Maestro Cloud →
-- webhook round-trip can correlate state back to a single row.
--
-- `github_workflow_run_id` — the GitHub Actions run id returned by
--   POST /repos/{owner}/{repo}/actions/workflows/{file}/dispatches.
--   Stored so the studio UI can deep-link into the build log.
--
-- `maestro_upload_id` — the Maestro Cloud upload id (top-level `id` field
--   in the webhook payload, per docs.maestro.dev). Stored on first webhook
--   so subsequent retries can be idempotent.
--
-- `queued_at` / `finished_at` — separates "row created" (created_at) from
--   the actual lifecycle timestamps. Useful for queue-latency metrics.
--
-- `status` values widen from {pending, running, passed, failed} to also
--   include {queued, cancelled, errored}; this matches what the GitHub
--   Actions + Maestro flow can land on. Using TEXT (not an enum) so future
--   states don't need a migration.
--
-- All columns are nullable so existing rows from the old simulation path
-- remain valid; nothing here drops or rewrites historical data.

ALTER TABLE public.eas_test_runs
  ADD COLUMN IF NOT EXISTS github_workflow_run_id text,
  ADD COLUMN IF NOT EXISTS maestro_upload_id text,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- Index the upload id so the webhook handler (which receives Maestro's
-- payload first, before any test run lookup) can find the row in O(log n).
CREATE INDEX IF NOT EXISTS eas_test_runs_maestro_upload_idx
  ON public.eas_test_runs (maestro_upload_id)
  WHERE maestro_upload_id IS NOT NULL;
