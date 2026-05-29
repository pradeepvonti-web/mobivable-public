
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS figma_tokens JSONB;

CREATE TABLE IF NOT EXISTS public.eas_test_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  build_id TEXT,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  yaml_flow TEXT NOT NULL DEFAULT '',
  logs TEXT NOT NULL DEFAULT '',
  screenshots TEXT[] NOT NULL DEFAULT '{}',
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.eas_test_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_test_runs" ON public.eas_test_runs;
CREATE POLICY "own_select_test_runs" ON public.eas_test_runs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_test_runs" ON public.eas_test_runs;
CREATE POLICY "own_insert_test_runs" ON public.eas_test_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_test_runs" ON public.eas_test_runs;
CREATE POLICY "own_update_test_runs" ON public.eas_test_runs FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_test_runs" ON public.eas_test_runs;
CREATE POLICY "own_delete_test_runs" ON public.eas_test_runs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS eas_test_runs_project_idx ON public.eas_test_runs(project_id, created_at DESC);
