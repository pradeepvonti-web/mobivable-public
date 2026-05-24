ALTER TABLE public.eas_apps
  ADD COLUMN IF NOT EXISTS github_repo_owner text,
  ADD COLUMN IF NOT EXISTS github_repo_name text,
  ADD COLUMN IF NOT EXISTS github_default_branch text DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS github_repo_node_id text,
  ADD COLUMN IF NOT EXISTS github_repo_db_id text,
  ADD COLUMN IF NOT EXISTS eas_github_repo_id text;

ALTER TABLE public.eas_builds
  ADD COLUMN IF NOT EXISTS receipt_id text,
  ADD COLUMN IF NOT EXISTS git_ref text;