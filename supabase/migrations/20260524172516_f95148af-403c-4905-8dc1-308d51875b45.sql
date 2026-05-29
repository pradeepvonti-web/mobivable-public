
-- GitHub OAuth connections per user
CREATE TABLE public.github_connections (
  user_id uuid NOT NULL PRIMARY KEY,
  github_user_id bigint NOT NULL,
  github_username text NOT NULL,
  access_token text NOT NULL,
  scopes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;

-- Users can see whether they're connected (but token is sensitive — we'll never select it client-side)
DROP POLICY IF EXISTS "own_select" ON public.github_connections;
CREATE POLICY "own_select" ON public.github_connections
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete" ON public.github_connections;
CREATE POLICY "own_delete" ON public.github_connections
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_github_connections
  BEFORE UPDATE ON public.github_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- OAuth state tokens (CSRF protection)
CREATE TABLE public.oauth_states (
  state text NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  redirect_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- No client policies: only service role (server) touches this table.

CREATE INDEX oauth_states_expires_idx ON public.oauth_states (expires_at);
