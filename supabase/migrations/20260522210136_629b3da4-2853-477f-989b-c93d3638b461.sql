
-- Add current_phase to projects if missing
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS current_phase TEXT;

-- Create project_phases table
CREATE TABLE IF NOT EXISTS public.project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('requirements','design','development','testing','deployment','completed')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, phase)
);

CREATE INDEX IF NOT EXISTS idx_project_phases_project ON public.project_phases(project_id);

ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;

-- RLS: owner of project can manage their phases
CREATE POLICY "own_select_phases" ON public.project_phases
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

CREATE POLICY "own_insert_phases" ON public.project_phases
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

CREATE POLICY "own_update_phases" ON public.project_phases
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

CREATE POLICY "own_delete_phases" ON public.project_phases
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

-- Enable realtime.
-- Idempotent: the earlier migration 20260522205200_sdlc_phases already adds
-- this same table to the publication, so a bare ADD here raises SQLSTATE
-- 42710 ("already member of publication") and aborts the migration — which
-- is what made `supabase start` fail in CI. Guard the add.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_phases'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_phases;
  END IF;
END $$;
