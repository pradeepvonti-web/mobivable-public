CREATE TABLE public.user_project_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  selected_agent text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id)
);

ALTER TABLE public.user_project_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select_prefs" ON public.user_project_prefs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_insert_prefs" ON public.user_project_prefs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update_prefs" ON public.user_project_prefs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_delete_prefs" ON public.user_project_prefs FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER user_project_prefs_set_updated_at
BEFORE UPDATE ON public.user_project_prefs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();