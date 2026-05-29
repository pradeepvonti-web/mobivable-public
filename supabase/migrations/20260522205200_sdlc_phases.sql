-- Add current_phase to projects
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS current_phase TEXT DEFAULT 'requirements'
  CHECK (current_phase IN ('requirements', 'design', 'development', 'testing', 'deployment', 'completed'));

-- Project phases tracking table
CREATE TABLE IF NOT EXISTS project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('requirements', 'design', 'development', 'testing', 'deployment')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, phase)
);

-- RLS
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own project phases" ON project_phases;
CREATE POLICY "Users can view own project phases" ON project_phases
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage own project phases" ON project_phases;
CREATE POLICY "Users can manage own project phases" ON project_phases
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'project_phases'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_phases;
  END IF;
END $$;
