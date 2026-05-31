ALTER TABLE public.eas_test_runs
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS github_workflow_run_id text,
  ADD COLUMN IF NOT EXISTS maestro_upload_id text;