
-- Per-project provisioned backend
CREATE TABLE public.project_backends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  supabase_project_ref text,
  supabase_url text,
  supabase_anon_key_enc text,
  supabase_service_role_key_enc text,
  region text NOT NULL DEFAULT 'us-east-1',
  status text NOT NULL DEFAULT 'pending',
  error_text text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_backends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select_backends" ON public.project_backends
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_insert_backends" ON public.project_backends
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update_backends" ON public.project_backends
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_delete_backends" ON public.project_backends
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER project_backends_set_updated_at
  BEFORE UPDATE ON public.project_backends
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Versioned migrations for each project backend
CREATE TABLE public.project_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  version integer NOT NULL,
  name text NOT NULL,
  sql text NOT NULL,
  applied_at timestamptz,
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);

CREATE INDEX project_migrations_project_idx ON public.project_migrations (project_id, version);

ALTER TABLE public.project_migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_select_pmig" ON public.project_migrations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_insert_pmig" ON public.project_migrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update_pmig" ON public.project_migrations
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_delete_pmig" ON public.project_migrations
  FOR DELETE USING (auth.uid() = user_id);

-- Add backend block to projects.result-adjacent storage via a dedicated column
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS backend_spec jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Realtime so the Backend panel can subscribe to status changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_backends;
