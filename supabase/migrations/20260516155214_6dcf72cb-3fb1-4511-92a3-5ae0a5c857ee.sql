CREATE TABLE public.project_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  supabase_url TEXT,
  supabase_anon_key TEXT,
  supabase_project_ref TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

ALTER TABLE public.project_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own integrations" ON public.project_integrations;
CREATE POLICY "Users view own integrations"
  ON public.project_integrations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own integrations" ON public.project_integrations;
CREATE POLICY "Users insert own integrations"
  ON public.project_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own integrations" ON public.project_integrations;
CREATE POLICY "Users update own integrations"
  ON public.project_integrations FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own integrations" ON public.project_integrations;
CREATE POLICY "Users delete own integrations"
  ON public.project_integrations FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_project_integrations_updated_at
  BEFORE UPDATE ON public.project_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_project_integrations_project ON public.project_integrations(project_id);