CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'building',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select" ON public.projects;
CREATE POLICY "own_select" ON public.projects FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert" ON public.projects;
CREATE POLICY "own_insert" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update" ON public.projects;
CREATE POLICY "own_update" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete" ON public.projects;
CREATE POLICY "own_delete" ON public.projects FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX projects_user_id_created_at_idx ON public.projects (user_id, created_at DESC);