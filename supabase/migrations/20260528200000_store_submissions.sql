-- Store credentials + submission tracking.
--
-- store_credentials   user-scoped App Store Connect + Play Console
--                     secrets. Encrypted at the application layer
--                     (libsodium / AES-256-GCM via the
--                     APP_SECRET_ENCRYPTION_KEY env var) so even DB
--                     readers without that key can't decrypt them.
--                     Per-user, not per-project — most users ship
--                     several apps under one Apple developer account.
--
-- store_submissions   per-build attempt to upload to TestFlight (iOS)
--                     or Play Internal Track (Android). v1 records the
--                     intent + status; a follow-up wires the actual
--                     `eas submit` invocation against a finished build.

CREATE TABLE IF NOT EXISTS public.store_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- ─── Apple App Store Connect API ───
  -- The Apple ASC API uses a JWT signed by a .p8 key. Three pieces:
  --   - issuer id (UUID-like)
  --   - key id (10-char alphanumeric)
  --   - key body (-----BEGIN PRIVATE KEY----- … PEM)
  asc_issuer_id text,
  asc_key_id text,
  /** AES-GCM ciphertext of the .p8 PEM. nonce|ciphertext|tag, base64. */
  asc_key_ciphertext text,

  -- ─── Google Play Developer ───
  /** The whole service-account JSON, encrypted. */
  play_service_account_ciphertext text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_store_credentials() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_store_credentials ON public.store_credentials;
CREATE TRIGGER trg_touch_store_credentials
  BEFORE UPDATE ON public.store_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_store_credentials();

ALTER TABLE public.store_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_store_credentials_all" ON public.store_credentials;
CREATE POLICY "own_store_credentials_all" ON public.store_credentials
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── Submissions ───
CREATE TABLE IF NOT EXISTS public.store_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- 'ios' (TestFlight) or 'android' (Play Internal Track).
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  /** When the studio fully wires `eas submit`, this is the eas_builds
   *  row id whose artifact gets uploaded. v1 leaves it null — the user
   *  uploads the .ipa / .aab manually and the studio just tracks the
   *  metadata they're submitting against. */
  eas_build_id uuid,
  /** queued → in_progress → succeeded / failed / cancelled. */
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','in_progress','succeeded','failed','cancelled')),
  error_text text,
  /** Submitted store record id when we have it (TestFlight build id,
   *  Play Internal Track upload id). Surfaced back in the UI as a deep link. */
  store_record_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS store_submissions_project_idx
  ON public.store_submissions (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS store_submissions_user_idx
  ON public.store_submissions (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_store_submission() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_store_submission ON public.store_submissions;
CREATE TRIGGER trg_touch_store_submission
  BEFORE UPDATE ON public.store_submissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_store_submission();

ALTER TABLE public.store_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_store_submissions_all" ON public.store_submissions;
CREATE POLICY "own_store_submissions_all" ON public.store_submissions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
