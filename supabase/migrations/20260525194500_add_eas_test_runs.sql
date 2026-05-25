CREATE TABLE IF NOT EXISTS public.eas_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  build_id uuid REFERENCES public.eas_builds(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  yaml_flow text NOT NULL,
  logs text,
  screenshots text[] DEFAULT '{}',
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eas_test_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own test runs" ON public.eas_test_runs;
CREATE POLICY "Users can manage own test runs" ON public.eas_test_runs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
