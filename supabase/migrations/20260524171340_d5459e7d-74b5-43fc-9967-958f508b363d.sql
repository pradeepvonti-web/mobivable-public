
CREATE TABLE public.project_monetization (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'admob',
  admob_ios_app_id text,
  admob_android_app_id text,
  admob_banner_ios text,
  admob_banner_android text,
  admob_interstitial_ios text,
  admob_interstitial_android text,
  admob_rewarded_ios text,
  admob_rewarded_android text,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, provider)
);

ALTER TABLE public.project_monetization ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select" ON public.project_monetization
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_insert" ON public.project_monetization
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update" ON public.project_monetization
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_delete" ON public.project_monetization
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_project_monetization
  BEFORE UPDATE ON public.project_monetization
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX project_monetization_project_id_idx
  ON public.project_monetization (project_id);
