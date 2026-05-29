-- Personal Access Tokens for the MCP server (and future programmatic API).
--
-- We follow the standard "store only the hash, return the plaintext exactly
-- once" pattern (GitHub-style PATs):
--   - Plaintext: `mvbl_pat_{32 random bytes hex}` returned by the issue fn.
--   - Stored:    SHA-256 hex digest of the plaintext, plus the first 8 chars
--                of the plaintext as `prefix` so the UI can show
--                `mvbl_pat_abcd1234… (revoke?)` without storing the secret.
--
-- A row's `revoked_at` is NULL until explicitly revoked; the MCP route only
-- accepts tokens whose hash matches AND revoked_at IS NULL.
-- `last_used_at` is updated lazily on each successful auth so users can
-- spot stale tokens.

CREATE TABLE IF NOT EXISTS public.mvbl_pats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Hex-encoded SHA-256 of the plaintext token. Indexed below for O(log n)
  -- lookup at auth time. Unique so the same hash can't be reused.
  token_hash text NOT NULL UNIQUE,
  -- First 8 chars of the plaintext (e.g. "mvbl_pat") + first 8 of the random
  -- segment, for display in the settings UI. Not sensitive.
  prefix text NOT NULL,
  -- Forward-compat: NULL = "all" (full user scope). When we add fine-grained
  -- scopes, this becomes an array of scope strings the route checks against.
  scopes text[] DEFAULT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS mvbl_pats_user_id_idx ON public.mvbl_pats (user_id);

-- The MCP route does the lookup via supabaseAdmin (no JWT context), but
-- listing / revoking from the studio UI must be scoped to the owner.
ALTER TABLE public.mvbl_pats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_mvbl_pats" ON public.mvbl_pats;
CREATE POLICY "own_select_mvbl_pats" ON public.mvbl_pats
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_mvbl_pats" ON public.mvbl_pats;
CREATE POLICY "own_update_mvbl_pats" ON public.mvbl_pats
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_mvbl_pats" ON public.mvbl_pats;
CREATE POLICY "own_delete_mvbl_pats" ON public.mvbl_pats
  FOR DELETE USING (auth.uid() = user_id);
-- INSERT is performed server-side via supabaseAdmin only — the hash and
-- prefix are derived inside the issue server fn. No client INSERT policy.
