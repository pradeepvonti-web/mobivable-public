
-- 1. app_settings: restrict SELECT to authenticated only
DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated can read app settings" ON public.app_settings;
CREATE POLICY "Authenticated can read app settings"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.app_settings FROM anon;

-- 2. github_connections: drop user-facing policies; only server (service_role) accesses this
DROP POLICY IF EXISTS own_select ON public.github_connections;
DROP POLICY IF EXISTS own_delete ON public.github_connections;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.github_connections FROM anon, authenticated;
GRANT ALL ON public.github_connections TO service_role;

-- 3. project_backends: drop all user-facing policies; only server accesses this
DROP POLICY IF EXISTS own_select_backends ON public.project_backends;
DROP POLICY IF EXISTS own_insert_backends ON public.project_backends;
DROP POLICY IF EXISTS own_update_backends ON public.project_backends;
DROP POLICY IF EXISTS own_delete_backends ON public.project_backends;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.project_backends FROM anon, authenticated;
GRANT ALL ON public.project_backends TO service_role;

-- 4. project_secrets: drop user-facing policy; only server accesses encrypted_value
DROP POLICY IF EXISTS "Users can manage own project secrets" ON public.project_secrets;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.project_secrets FROM anon, authenticated;
GRANT ALL ON public.project_secrets TO service_role;
