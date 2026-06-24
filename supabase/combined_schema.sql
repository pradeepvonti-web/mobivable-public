-- Migration: 20260516015351_d2d856ef-b9cb-4854-bf84-66d073a5938e.sql

-- Plan tier enum
create type public.plan_tier as enum ('free_beta', 'starter', 'pro');

-- Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan public.plan_tier not null default 'free_beta',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup, reading plan + display_name from raw_user_meta_data
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_plan public.plan_tier;
begin
  begin
    selected_plan := coalesce(
      (new.raw_user_meta_data ->> 'plan')::public.plan_tier,
      'free_beta'::public.plan_tier
    );
  exception when others then
    selected_plan := 'free_beta';
  end;

  insert into public.profiles (id, display_name, plan)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    selected_plan
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Migration: 20260516015409_50eb3b9a-aa7b-47ff-a9dd-440ad1465c69.sql

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;


-- Migration: 20260516020510_ff9983f5-a44d-4121-810c-76e81769a763.sql
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  paddle_subscription_id text not null unique,
  paddle_customer_id text not null,
  product_id text not null,
  price_id text not null,
  status text not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  environment text not null default 'sandbox',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_subscriptions_user_id on public.subscriptions(user_id);
create index idx_subscriptions_paddle_id on public.subscriptions(paddle_subscription_id);

alter table public.subscriptions enable row level security;

DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
create policy "Users can view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;
create policy "Service role can manage subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'service_role');

create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

create or replace function public.has_active_subscription(
  user_uuid uuid,
  check_env text default 'live'
)
returns boolean language sql security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = user_uuid
    and environment = check_env
    and (
      (status in ('active', 'trialing') and (current_period_end is null or current_period_end > now()))
      or (status = 'canceled' and current_period_end > now())
    )
  );
$$;

-- Migration: 20260516020528_589cc572-09fe-4ffe-8916-d808bd94da7c.sql
revoke execute on function public.has_active_subscription(uuid, text) from public, anon, authenticated;

-- Migration: 20260516021151_295d15ec-fa57-40af-ada9-a50a6caf4e0a.sql
-- Map a price_id (human-readable external id) to a plan_tier
create or replace function public.plan_from_price(p_price_id text)
returns public.plan_tier
language sql
immutable
set search_path = public
as $$
  select case
    when p_price_id like 'starter_%' then 'starter'::public.plan_tier
    when p_price_id like 'pro_%'     then 'pro'::public.plan_tier
    else null
  end;
$$;

-- Sync profile.plan from a subscription row's status + price + period_end
create or replace function public.sync_profile_plan_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plan_tier;
  v_has_access boolean;
begin
  v_plan := public.plan_from_price(new.price_id);
  if v_plan is null then
    return new;
  end if;

  v_has_access :=
    (new.status in ('active', 'trialing', 'past_due')
      and (new.current_period_end is null or new.current_period_end > now()))
    or (new.status = 'canceled'
      and new.current_period_end is not null
      and new.current_period_end > now());

  if v_has_access then
    update public.profiles
       set plan = v_plan,
           updated_at = now()
     where id = new.user_id
       and plan is distinct from v_plan;
  else
    -- canceled & period over: downgrade to free_beta
    update public.profiles
       set plan = 'free_beta',
           updated_at = now()
     where id = new.user_id
       and plan = v_plan;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_plan on public.subscriptions;
create trigger trg_sync_profile_plan
after insert or update on public.subscriptions
for each row execute function public.sync_profile_plan_from_subscription();

-- Sweep: downgrade users whose canceled subscriptions have expired
create or replace function public.sweep_expired_subscriptions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
     set plan = 'free_beta', updated_at = now()
   where p.plan in ('starter', 'pro')
     and not exists (
       select 1 from public.subscriptions s
        where s.user_id = p.id
          and (
            (s.status in ('active', 'trialing', 'past_due')
              and (s.current_period_end is null or s.current_period_end > now()))
            or (s.status = 'canceled'
              and s.current_period_end is not null
              and s.current_period_end > now())
          )
     );
end;
$$;

-- Nightly cron
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('sweep-expired-subscriptions');
exception when others then null;
end $$;
select cron.schedule(
  'sweep-expired-subscriptions',
  '17 3 * * *',
  $$select public.sweep_expired_subscriptions();$$
);

-- Migration: 20260516021210_b406fc00-2a40-40c2-86bd-c9eeba89fc1c.sql
revoke execute on function public.sync_profile_plan_from_subscription() from public, anon, authenticated;
revoke execute on function public.sweep_expired_subscriptions() from public, anon, authenticated;

-- Migration: 20260516023408_email_infra.sql
-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');


-- Migration: 20260516023453_email_infra.sql
-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');


-- Migration: 20260516023518_email_infra.sql
-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');


-- Migration: 20260516023553_email_infra.sql
-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');


-- Migration: 20260516023632_email_infra.sql
-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');


-- Migration: 20260516024118_email_infra.sql
-- Email infrastructure
-- Creates the queue system, send log, send state, suppression, and unsubscribe
-- tables used by both auth and transactional emails.

-- Extensions required for queue processing
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create email queues (auth = high priority, transactional = normal)
-- Wrapped in DO blocks to handle "queue already exists" errors idempotently.
DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Dead-letter queues for messages that exceed max retries
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Email send log table (audit trail for all send attempts)
-- UPDATE is allowed for the service role so the suppression edge function
-- can update a log record's status when a bounce/complaint/unsubscribe occurs.
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
  CREATE POLICY "Service role can read send log"
    ON public.email_send_log FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
  CREATE POLICY "Service role can insert send log"
    ON public.email_send_log FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
  CREATE POLICY "Service role can update send log"
    ON public.email_send_log FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);

-- Backfill: add message_id column to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_log ADD COLUMN message_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);

-- Prevent duplicate sends: only one 'sent' row per message_id.
-- If VT expires and another worker picks up the same message, the pre-send
-- check catches it. This index is a DB-level safety net for race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique
  ON public.email_send_log(message_id) WHERE status = 'sent';

-- Backfill: update status CHECK constraint for existing tables that predate new statuses
DO $$ BEGIN
  ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'));
END $$;

-- Rate-limit state and queue config (single row, tracks Retry-After cooldown + throughput settings)
CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Backfill: add config columns to existing tables that predate this migration
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN batch_size INTEGER NOT NULL DEFAULT 10;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN send_delay_ms INTEGER NOT NULL DEFAULT 200;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.email_send_state ADD COLUMN transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
  CREATE POLICY "Service role can manage send state"
    ON public.email_send_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RPC wrappers so Edge Functions can interact with pgmq via supabase.rpc()
-- (PostgREST only exposes functions in the public schema; pgmq functions are in the pgmq schema)
-- All wrappers auto-create the queue on undefined_table (42P01) so emails
-- are never lost if the queue was dropped (extension upgrade, restore, etc.).
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- Restrict queue RPC wrappers to service_role only (SECURITY DEFINER runs as owner,
-- so without this any authenticated user could manipulate the email queues)
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

-- Suppressed emails table (tracks unsubscribes, bounces, complaints)
-- Append-only: no DELETE or UPDATE policies to prevent bypassing suppression.
CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
  CREATE POLICY "Service role can read suppressed emails"
    ON public.suppressed_emails FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
  CREATE POLICY "Service role can insert suppressed emails"
    ON public.suppressed_emails FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

-- Email unsubscribe tokens table (one token per email address for unsubscribe links)
-- No DELETE policy to prevent removing tokens. UPDATE allowed only to mark tokens as used.
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can read tokens"
    ON public.email_unsubscribe_tokens FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can insert tokens"
    ON public.email_unsubscribe_tokens FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
  CREATE POLICY "Service role can mark tokens as used"
    ON public.email_unsubscribe_tokens FOR UPDATE
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ============================================================
-- POST-MIGRATION STEPS (applied dynamically by setup_email_infra)
-- These steps contain project-specific secrets and URLs and
-- cannot be expressed as static SQL. They are applied via the
-- Supabase Management API (ExecuteSQL) each time the tool runs.
-- ============================================================
--
-- 1. VAULT SECRET
--    Stores (or updates) the Supabase service_role key in
--    vault as 'email_queue_service_role_key'.
--    Uses vault.create_secret / vault.update_secret (upsert).
--    To revert: DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';
--
-- 2. CRON JOB (pg_cron)
--    Creates job 'process-email-queue' with a 5-second interval.
--    The job checks:
--      a) rate-limit cooldown (email_send_state.retry_after_until)
--      b) whether auth_emails or transactional_emails queues have messages
--    If conditions are met, it calls the process-email-queue Edge Function
--    via net.http_post using the vault-stored service_role key.
--    To revert: SELECT cron.unschedule('process-email-queue');


-- Migration: 20260516030834_ec54ee5b-f5a9-490f-b5ec-9687f62c2419.sql
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

-- Migration: 20260516031008_ecb562ac-86c2-42e0-86d9-bdb1b713c8ea.sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-attachments', 'project-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "project_attachments_select_own" ON storage.objects;
CREATE POLICY "project_attachments_select_own"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "project_attachments_insert_own" ON storage.objects;
CREATE POLICY "project_attachments_insert_own"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "project_attachments_update_own" ON storage.objects;
CREATE POLICY "project_attachments_update_own"
ON storage.objects FOR UPDATE
USING (bucket_id = 'project-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "project_attachments_delete_own" ON storage.objects;
CREATE POLICY "project_attachments_delete_own"
ON storage.objects FOR DELETE
USING (bucket_id = 'project-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Migration: 20260516034213_1d03939d-2359-45a6-818d-b704a74068af.sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS result text,
  ADD COLUMN IF NOT EXISTS error_text text;

-- Migration: 20260516034745_d6f69690-bc10-4f3c-ad59-824a1f1092bc.sql
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read app settings" ON public.app_settings;
CREATE POLICY "Anyone can read app settings"
ON public.app_settings FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Service role can manage app settings" ON public.app_settings;
CREATE POLICY "Service role can manage app settings"
ON public.app_settings FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER app_settings_set_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (key, value)
VALUES ('default_model', '"Gemini 3 Flash"'::jsonb);

-- Migration: 20260516134358_c0c0fba1-03ee-4283-821f-aaaf1650903f.sql
CREATE TABLE public.project_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_messages_project_created ON public.project_messages(project_id, created_at);

ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their project messages" ON public.project_messages;
CREATE POLICY "Owners can view their project messages"
ON public.project_messages FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can insert their project messages" ON public.project_messages;
CREATE POLICY "Owners can insert their project messages"
ON public.project_messages FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can delete their project messages" ON public.project_messages;
CREATE POLICY "Owners can delete their project messages"
ON public.project_messages FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Migration: 20260516140232_0a3bb3f3-d0e9-4430-a079-008e5bdf26be.sql
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS visual_edits jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Migration: 20260516144519_6432caf5-82b4-4966-b08d-8825226053ce.sql

-- Roles enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role manages roles" ON public.user_roles;
CREATE POLICY "Service role manages roles"
  ON public.user_roles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- has_role helper (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Allow admins to read/write app_settings
DROP POLICY IF EXISTS "Admins can manage app settings" ON public.app_settings;
CREATE POLICY "Admins can manage app settings"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- Migration: 20260516145855_a623ec44-cbbe-4c65-8de0-e1bee983bcd3.sql

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  status text not null default 'pending',
  selected_roles text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  role text not null,
  ordinal int not null default 0,
  status text not null default 'waiting',
  output text,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index on public.agent_runs(project_id, created_at desc);
create index on public.agent_tasks(run_id, ordinal);
create index on public.agent_messages(run_id, created_at);

alter table public.agent_runs enable row level security;
alter table public.agent_tasks enable row level security;
alter table public.agent_messages enable row level security;

DROP POLICY IF EXISTS "own_select_runs" ON public.agent_runs;
create policy "own_select_runs" on public.agent_runs for select using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_runs" ON public.agent_runs;
create policy "own_insert_runs" on public.agent_runs for insert with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_runs" ON public.agent_runs;
create policy "own_update_runs" on public.agent_runs for update using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_runs" ON public.agent_runs;
create policy "own_delete_runs" on public.agent_runs for delete using (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_select_tasks" ON public.agent_tasks;
create policy "own_select_tasks" on public.agent_tasks for select using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_tasks" ON public.agent_tasks;
create policy "own_insert_tasks" on public.agent_tasks for insert with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_tasks" ON public.agent_tasks;
create policy "own_update_tasks" on public.agent_tasks for update using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_tasks" ON public.agent_tasks;
create policy "own_delete_tasks" on public.agent_tasks for delete using (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_select_msgs" ON public.agent_messages;
create policy "own_select_msgs" on public.agent_messages for select using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_msgs" ON public.agent_messages;
create policy "own_insert_msgs" on public.agent_messages for insert with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_msgs" ON public.agent_messages;
create policy "own_delete_msgs" on public.agent_messages for delete using (auth.uid() = user_id);

create trigger trg_agent_runs_updated before update on public.agent_runs
  for each row execute function public.set_updated_at();
create trigger trg_agent_tasks_updated before update on public.agent_tasks
  for each row execute function public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agent_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_tasks;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agent_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agent_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_runs;
  END IF;
END $$;


-- Migration: 20260516151423_827d6b56-0573-4ccb-986f-a70484cf7737.sql
CREATE TABLE public.user_project_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  selected_agent text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id)
);

ALTER TABLE public.user_project_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_prefs" ON public.user_project_prefs;
CREATE POLICY "own_select_prefs" ON public.user_project_prefs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_prefs" ON public.user_project_prefs;
CREATE POLICY "own_insert_prefs" ON public.user_project_prefs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_prefs" ON public.user_project_prefs;
CREATE POLICY "own_update_prefs" ON public.user_project_prefs FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_prefs" ON public.user_project_prefs;
CREATE POLICY "own_delete_prefs" ON public.user_project_prefs FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER user_project_prefs_set_updated_at
BEFORE UPDATE ON public.user_project_prefs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Migration: 20260516155214_6dcf72cb-3fb1-4511-92a3-5ae0a5c857ee.sql
CREATE TABLE public.project_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  supabase_url TEXT,
  supabase_anon_key TEXT,
  supabase_project_ref TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

ALTER TABLE public.project_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own integrations" ON public.project_integrations;
CREATE POLICY "Users view own integrations"
  ON public.project_integrations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own integrations" ON public.project_integrations;
CREATE POLICY "Users insert own integrations"
  ON public.project_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own integrations" ON public.project_integrations;
CREATE POLICY "Users update own integrations"
  ON public.project_integrations FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own integrations" ON public.project_integrations;
CREATE POLICY "Users delete own integrations"
  ON public.project_integrations FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER set_project_integrations_updated_at
  BEFORE UPDATE ON public.project_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_project_integrations_project ON public.project_integrations(project_id);

-- Migration: 20260516160700_7d0e9bae-e0e7-46cc-989a-fac641cd7e21.sql
create table public.project_env_vars (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  name text not null,
  value text not null default '',
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id, name)
);

create index project_env_vars_project_idx on public.project_env_vars(project_id);

alter table public.project_env_vars enable row level security;

DROP POLICY IF EXISTS "Users read own env vars" ON public.project_env_vars;
create policy "Users read own env vars"
  on public.project_env_vars for select
  using (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own env vars" ON public.project_env_vars;
create policy "Users insert own env vars"
  on public.project_env_vars for insert
  with check (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own env vars" ON public.project_env_vars;
create policy "Users update own env vars"
  on public.project_env_vars for update
  using (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own env vars" ON public.project_env_vars;
create policy "Users delete own env vars"
  on public.project_env_vars for delete
  using (auth.uid() = user_id);

create trigger project_env_vars_set_updated_at
before update on public.project_env_vars
for each row execute function public.set_updated_at();

-- Migration: 20260516171954_457fec15-3ef8-45b2-8dd4-9582c8b89112.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_preference text NOT NULL DEFAULT 'system'
  CHECK (theme_preference IN ('light','dark','system'));

CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  value text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_api_keys" ON public.user_api_keys;
CREATE POLICY "own_select_api_keys" ON public.user_api_keys
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_api_keys" ON public.user_api_keys;
CREATE POLICY "own_insert_api_keys" ON public.user_api_keys
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_api_keys" ON public.user_api_keys;
CREATE POLICY "own_update_api_keys" ON public.user_api_keys
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_api_keys" ON public.user_api_keys;
CREATE POLICY "own_delete_api_keys" ON public.user_api_keys
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER set_user_api_keys_updated_at
  BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- Migration: 20260516172230_8a3450cf-2b2f-4b20-97c3-610fb6619a8f.sql
create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  content text not null default '',
  file_url text,
  file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.knowledge_items enable row level security;

DROP POLICY IF EXISTS "own_select_knowledge" ON public.knowledge_items;
create policy "own_select_knowledge" on public.knowledge_items
  for select to authenticated using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_knowledge" ON public.knowledge_items;
create policy "own_insert_knowledge" on public.knowledge_items
  for insert to authenticated with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_knowledge" ON public.knowledge_items;
create policy "own_update_knowledge" on public.knowledge_items
  for update to authenticated using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_knowledge" ON public.knowledge_items;
create policy "own_delete_knowledge" on public.knowledge_items
  for delete to authenticated using (auth.uid() = user_id);

create trigger knowledge_items_set_updated_at
  before update on public.knowledge_items
  for each row execute function public.set_updated_at();

create index knowledge_items_user_updated_idx
  on public.knowledge_items(user_id, updated_at desc);

-- Migration: 20260516172633_7b7a8f3e-33b2-4007-a0e6-a6a4bf7d7576.sql
create table public.user_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  label text not null,
  token text not null default '',
  account text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_connectors enable row level security;

DROP POLICY IF EXISTS "own_select_connectors" ON public.user_connectors;
create policy "own_select_connectors" on public.user_connectors
  for select to authenticated using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_connectors" ON public.user_connectors;
create policy "own_insert_connectors" on public.user_connectors
  for insert to authenticated with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_connectors" ON public.user_connectors;
create policy "own_update_connectors" on public.user_connectors
  for update to authenticated using (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_connectors" ON public.user_connectors;
create policy "own_delete_connectors" on public.user_connectors
  for delete to authenticated using (auth.uid() = user_id);

create trigger user_connectors_set_updated_at
  before update on public.user_connectors
  for each row execute function public.set_updated_at();

create index user_connectors_user_updated_idx
  on public.user_connectors(user_id, updated_at desc);

-- Migration: 20260516224002_abbe236b-196f-4932-943f-364fbf44ae93.sql
-- Audit log for admin authentication activity.
create table if not exists public.admin_login_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text not null,
  success boolean not null,
  reason text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists admin_login_audit_created_at_idx
  on public.admin_login_audit (created_at desc);
create index if not exists admin_login_audit_email_idx
  on public.admin_login_audit (email);

alter table public.admin_login_audit enable row level security;

drop policy if exists "Admins can read login audit" on public.admin_login_audit;
create policy "Admins can read login audit"
  on public.admin_login_audit
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "Service role manages login audit" on public.admin_login_audit;
create policy "Service role manages login audit"
  on public.admin_login_audit
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- SECURITY DEFINER helper: resolve user_id by email from auth.users.
create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public, anon, authenticated;

-- Migration: 20260516224417_a8f44eab-71a7-4f78-9586-b62c8b32c544.sql
create table if not exists public.password_reset_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text not null,
  event text not null check (event in ('request','complete')),
  ip text,
  user_agent text,
  created_at timestamp with time zone not null default now()
);

alter table public.password_reset_audit enable row level security;

DROP POLICY IF EXISTS "Admins can read password reset audit" ON public.password_reset_audit;
create policy "Admins can read password reset audit"
  on public.password_reset_audit
  for select
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages password reset audit" ON public.password_reset_audit;
create policy "Service role manages password reset audit"
  on public.password_reset_audit
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists password_reset_audit_created_at_idx
  on public.password_reset_audit (created_at desc);

-- Migration: 20260522173346_1925e167-bba7-4c8e-b9e1-fc836cc8cdbb.sql

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

DROP POLICY IF EXISTS "own_select_backends" ON public.project_backends;
CREATE POLICY "own_select_backends" ON public.project_backends
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_backends" ON public.project_backends;
CREATE POLICY "own_insert_backends" ON public.project_backends
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_backends" ON public.project_backends;
CREATE POLICY "own_update_backends" ON public.project_backends
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_backends" ON public.project_backends;
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

DROP POLICY IF EXISTS "own_select_pmig" ON public.project_migrations;
CREATE POLICY "own_select_pmig" ON public.project_migrations
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_pmig" ON public.project_migrations;
CREATE POLICY "own_insert_pmig" ON public.project_migrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_pmig" ON public.project_migrations;
CREATE POLICY "own_update_pmig" ON public.project_migrations
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_pmig" ON public.project_migrations;
CREATE POLICY "own_delete_pmig" ON public.project_migrations
  FOR DELETE USING (auth.uid() = user_id);

-- Add backend block to projects.result-adjacent storage via a dedicated column
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS backend_spec jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Realtime so the Backend panel can subscribe to status changes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'project_backends'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_backends;
  END IF;
END $$;


-- Migration: 20260522175740_a7987e59-cfb2-4704-b291-7f84a488b585.sql

INSERT INTO storage.buckets (id, name, public)
VALUES ('app-assets', 'app-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read for the bucket
DROP POLICY IF EXISTS "Public read app-assets" ON storage.objects;
CREATE POLICY "Public read app-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-assets');


-- Migration: 20260522191504_79963adf-747b-49bb-8f0c-5784c4db3df1.sql

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS agents_md TEXT;

INSERT INTO public.app_settings (key, value)
VALUES ('agents_bible', '{"content": "", "fileName": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- Migration: 20260522205200_sdlc_phases.sql
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


-- Migration: 20260522210136_629b3da4-2853-477f-989b-c93d3638b461.sql

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
DROP POLICY IF EXISTS "own_select_phases" ON public.project_phases;
CREATE POLICY "own_select_phases" ON public.project_phases
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own_insert_phases" ON public.project_phases;
CREATE POLICY "own_insert_phases" ON public.project_phases
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own_update_phases" ON public.project_phases;
CREATE POLICY "own_update_phases" ON public.project_phases
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own_delete_phases" ON public.project_phases;
CREATE POLICY "own_delete_phases" ON public.project_phases
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
  );

-- Enable realtime.
-- Idempotent: the earlier migration 20260522205200_sdlc_phases already adds
-- this same table to the publication, so a bare ADD here raises SQLSTATE
-- 42710 ("already member of publication") and aborts the migration â€” which
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


-- Migration: 20260524162606_5c573b51-5521-46c9-8ee4-29c13876639d.sql

-- Balances table
create table public.ai_credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_remaining int not null default 0,
  monthly_granted int not null default 0,
  daily_remaining int not null default 0,
  daily_granted int not null default 0,
  period_start timestamptz not null default now(),
  last_daily_reset date not null default current_date,
  updated_at timestamptz not null default now()
);

alter table public.ai_credit_balances enable row level security;

DROP POLICY IF EXISTS "Users view own credit balance" ON public.ai_credit_balances;
create policy "Users view own credit balance"
  on public.ai_credit_balances for select
  using (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages credit balances" ON public.ai_credit_balances;
create policy "Service role manages credit balances"
  on public.ai_credit_balances for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Ledger table
create table public.ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  amount int not null,
  reason text not null,
  daily_after int not null default 0,
  monthly_after int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_ai_credit_ledger_user_created on public.ai_credit_ledger(user_id, created_at desc);

alter table public.ai_credit_ledger enable row level security;

DROP POLICY IF EXISTS "Users view own credit ledger" ON public.ai_credit_ledger;
create policy "Users view own credit ledger"
  on public.ai_credit_ledger for select
  using (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages credit ledger" ON public.ai_credit_ledger;
create policy "Service role manages credit ledger"
  on public.ai_credit_ledger for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Plan -> grant mapping
create or replace function public.ai_credit_plan_grant(p_plan text)
returns table(monthly int, daily int)
language sql immutable
set search_path = public
as $$
  select
    case p_plan
      when 'starter'   then 120
      when 'pro'       then 300
      when 'scale'     then 700
      when 'business'  then 2000
      else 0
    end as monthly,
    case p_plan
      when 'free_beta' then 6
      else 0
    end as daily;
$$;

-- Grant credits for a user based on current plan
create or replace function public.grant_ai_credits(p_user uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_plan text;
  v_monthly int;
  v_daily int;
begin
  select plan::text into v_plan from public.profiles where id = p_user;
  if v_plan is null then v_plan := 'free_beta'; end if;

  select monthly, daily into v_monthly, v_daily
    from public.ai_credit_plan_grant(v_plan);

  insert into public.ai_credit_balances (
    user_id, monthly_remaining, monthly_granted,
    daily_remaining, daily_granted, period_start, last_daily_reset
  ) values (
    p_user, v_monthly, v_monthly, v_daily, v_daily, now(), current_date
  )
  on conflict (user_id) do update
    set monthly_remaining = v_monthly,
        monthly_granted   = v_monthly,
        daily_granted     = v_daily,
        period_start      = now(),
        updated_at        = now();
end;
$$;

-- Consume credits
create or replace function public.consume_ai_credits(
  p_user uuid,
  p_amount int,
  p_reason text,
  p_project uuid default null
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  bal public.ai_credit_balances%rowtype;
  v_plan text;
  v_monthly int;
  v_daily int;
  v_take_daily int;
  v_take_monthly int;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', true, 'daily_remaining', 0, 'monthly_remaining', 0);
  end if;

  -- ensure row exists
  perform public.grant_ai_credits(p_user)
    where not exists (select 1 from public.ai_credit_balances where user_id = p_user);

  select * into bal from public.ai_credit_balances where user_id = p_user for update;

  -- daily reset
  if bal.last_daily_reset < current_date then
    select plan::text into v_plan from public.profiles where id = p_user;
    if v_plan is null then v_plan := 'free_beta'; end if;
    select daily into v_daily from public.ai_credit_plan_grant(v_plan);
    bal.daily_remaining := v_daily;
    bal.daily_granted   := v_daily;
    bal.last_daily_reset := current_date;
  end if;

  -- monthly reset (30 days)
  if bal.period_start + interval '30 days' <= now() then
    select plan::text into v_plan from public.profiles where id = p_user;
    if v_plan is null then v_plan := 'free_beta'; end if;
    select monthly into v_monthly from public.ai_credit_plan_grant(v_plan);
    bal.monthly_remaining := v_monthly;
    bal.monthly_granted   := v_monthly;
    bal.period_start      := now();
  end if;

  if (bal.daily_remaining + bal.monthly_remaining) < p_amount then
    update public.ai_credit_balances
      set daily_remaining   = bal.daily_remaining,
          daily_granted     = bal.daily_granted,
          monthly_remaining = bal.monthly_remaining,
          monthly_granted   = bal.monthly_granted,
          period_start      = bal.period_start,
          last_daily_reset  = bal.last_daily_reset,
          updated_at        = now()
      where user_id = p_user;
    return jsonb_build_object(
      'ok', false,
      'daily_remaining', bal.daily_remaining,
      'monthly_remaining', bal.monthly_remaining
    );
  end if;

  v_take_daily := least(bal.daily_remaining, p_amount);
  v_take_monthly := p_amount - v_take_daily;

  bal.daily_remaining   := bal.daily_remaining - v_take_daily;
  bal.monthly_remaining := bal.monthly_remaining - v_take_monthly;

  update public.ai_credit_balances
    set daily_remaining   = bal.daily_remaining,
        daily_granted     = bal.daily_granted,
        monthly_remaining = bal.monthly_remaining,
        monthly_granted   = bal.monthly_granted,
        period_start      = bal.period_start,
        last_daily_reset  = bal.last_daily_reset,
        updated_at        = now()
    where user_id = p_user;

  insert into public.ai_credit_ledger (user_id, project_id, amount, reason, daily_after, monthly_after)
    values (p_user, p_project, p_amount, p_reason, bal.daily_remaining, bal.monthly_remaining);

  return jsonb_build_object(
    'ok', true,
    'daily_remaining', bal.daily_remaining,
    'monthly_remaining', bal.monthly_remaining
  );
end;
$$;

-- Trigger: refill on plan change
create or replace function public.handle_profile_plan_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.plan is distinct from old.plan then
    perform public.grant_ai_credits(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_plan_change on public.profiles;
create trigger trg_profile_plan_change
  after update of plan on public.profiles
  for each row execute function public.handle_profile_plan_change();

-- Trigger: grant on profile insert (covers new signups)
create or replace function public.handle_profile_insert_credits()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.grant_ai_credits(new.id);
  return new;
end;
$$;

drop trigger if exists trg_profile_insert_credits on public.profiles;
create trigger trg_profile_insert_credits
  after insert on public.profiles
  for each row execute function public.handle_profile_insert_credits();

-- Backfill existing users
do $$
declare r record;
begin
  for r in select id from public.profiles loop
    perform public.grant_ai_credits(r.id);
  end loop;
end $$;


-- Migration: 20260524162912_66d376f0-95dd-4406-825c-bbfbf0bcc42c.sql

alter type public.plan_tier add value if not exists 'scale';
alter type public.plan_tier add value if not exists 'business';


-- Migration: 20260524162940_0c8db1de-6f8d-4819-a3be-ae6fd19ff706.sql

create or replace function public.plan_from_price(p_price_id text)
returns plan_tier
language sql immutable
set search_path = public
as $$
  select case
    when p_price_id like 'starter_%'  then 'starter'::public.plan_tier
    when p_price_id like 'pro_%'      then 'pro'::public.plan_tier
    when p_price_id like 'scale_%'    then 'scale'::public.plan_tier
    when p_price_id like 'business_%' then 'business'::public.plan_tier
    else null
  end;
$$;


-- Migration: 20260524171340_d5459e7d-74b5-43fc-9967-958f508b363d.sql

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

DROP POLICY IF EXISTS "own_select" ON public.project_monetization;
CREATE POLICY "own_select" ON public.project_monetization
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert" ON public.project_monetization;
CREATE POLICY "own_insert" ON public.project_monetization
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update" ON public.project_monetization;
CREATE POLICY "own_update" ON public.project_monetization
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete" ON public.project_monetization;
CREATE POLICY "own_delete" ON public.project_monetization
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_project_monetization
  BEFORE UPDATE ON public.project_monetization
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX project_monetization_project_id_idx
  ON public.project_monetization (project_id);


-- Migration: 20260524172516_f95148af-403c-4905-8dc1-308d51875b45.sql

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

-- Users can see whether they're connected (but token is sensitive â€” we'll never select it client-side)
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


-- Migration: 20260524173825_9c55d0b6-9f73-400d-b775-17bbf8c531ef.sql

create table if not exists public.eas_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  eas_app_id text not null,
  eas_account_name text not null,
  eas_slug text not null,
  expo_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

alter table public.eas_apps enable row level security;

DROP POLICY IF EXISTS "eas_apps_select_own" ON public.eas_apps;
create policy "eas_apps_select_own" on public.eas_apps
  for select using (auth.uid() = user_id);
DROP POLICY IF EXISTS "eas_apps_insert_own" ON public.eas_apps;
create policy "eas_apps_insert_own" on public.eas_apps
  for insert with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "eas_apps_update_own" ON public.eas_apps;
create policy "eas_apps_update_own" on public.eas_apps
  for update using (auth.uid() = user_id);
DROP POLICY IF EXISTS "eas_apps_delete_own" ON public.eas_apps;
create policy "eas_apps_delete_own" on public.eas_apps
  for delete using (auth.uid() = user_id);

create trigger eas_apps_set_updated_at
  before update on public.eas_apps
  for each row execute function public.set_updated_at();

create table if not exists public.eas_builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  eas_app_id text not null,
  eas_build_id text,
  platform text not null check (platform in ('android', 'ios')),
  profile text not null default 'preview',
  status text not null default 'pending',
  artifact_url text,
  logs_url text,
  error_text text,
  archive_url text,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eas_builds_project_idx on public.eas_builds(project_id, created_at desc);

alter table public.eas_builds enable row level security;

DROP POLICY IF EXISTS "eas_builds_select_own" ON public.eas_builds;
create policy "eas_builds_select_own" on public.eas_builds
  for select using (auth.uid() = user_id);
DROP POLICY IF EXISTS "eas_builds_insert_own" ON public.eas_builds;
create policy "eas_builds_insert_own" on public.eas_builds
  for insert with check (auth.uid() = user_id);
DROP POLICY IF EXISTS "eas_builds_update_own" ON public.eas_builds;
create policy "eas_builds_update_own" on public.eas_builds
  for update using (auth.uid() = user_id);
DROP POLICY IF EXISTS "eas_builds_delete_own" ON public.eas_builds;
create policy "eas_builds_delete_own" on public.eas_builds
  for delete using (auth.uid() = user_id);

create trigger eas_builds_set_updated_at
  before update on public.eas_builds
  for each row execute function public.set_updated_at();


-- Migration: 20260524194326_1752ee9d-0858-4b62-8ae5-1d6307f0ec0a.sql
ALTER TABLE public.eas_apps
  ADD COLUMN IF NOT EXISTS github_repo_owner text,
  ADD COLUMN IF NOT EXISTS github_repo_name text,
  ADD COLUMN IF NOT EXISTS github_default_branch text DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS github_repo_node_id text,
  ADD COLUMN IF NOT EXISTS github_repo_db_id text,
  ADD COLUMN IF NOT EXISTS eas_github_repo_id text;

ALTER TABLE public.eas_builds
  ADD COLUMN IF NOT EXISTS receipt_id text,
  ADD COLUMN IF NOT EXISTS git_ref text;

-- Migration: 20260525000001_project_snapshots.sql
create table if not exists project_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  label text not null default 'Auto-save',
  schema jsonb not null,
  visual_edits jsonb,
  source text not null default 'auto',
  element_count integer default 0,
  screen_count integer default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_snapshots_project on project_snapshots(project_id, created_at desc);
alter table project_snapshots enable row level security;
DROP POLICY IF EXISTS "Users can view own project snapshots" ON project_snapshots;
create policy "Users can view own project snapshots" on project_snapshots for select using (
  user_id = auth.uid()
);
DROP POLICY IF EXISTS "Users can insert own snapshots" ON project_snapshots;
create policy "Users can insert own snapshots" on project_snapshots for insert with check (
  user_id = auth.uid()
);
DROP POLICY IF EXISTS "Users can delete own snapshots" ON project_snapshots;
create policy "Users can delete own snapshots" on project_snapshots for delete using (
  user_id = auth.uid()
);


-- Migration: 20260525000002_project_file_overrides.sql
create table if not exists project_file_overrides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  file_path text not null,
  content text not null,
  updated_at timestamptz not null default now(),
  unique(project_id, file_path)
);
alter table project_file_overrides enable row level security;
DROP POLICY IF EXISTS "Users can manage own file overrides" ON project_file_overrides;
create policy "Users can manage own file overrides" on project_file_overrides for all using (
  user_id = auth.uid()
);


-- Migration: 20260525000003_project_secrets.sql
create table if not exists project_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  key_name text not null,
  encrypted_value text not null,
  category text not null default 'custom',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, key_name)
);
alter table project_secrets enable row level security;
DROP POLICY IF EXISTS "Users can manage own project secrets" ON project_secrets;
create policy "Users can manage own project secrets" on project_secrets for all using (
  user_id = auth.uid()
);


-- Migration: 20260525000004_app_templates.sql
create table if not exists app_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null,
  tags text[] default '{}',
  preview_image_url text,
  schema jsonb not null,
  feature_list text[] default '{}',
  author_id uuid,
  is_featured boolean default false,
  is_community boolean default false,
  use_count integer default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_templates_category on app_templates(category);
alter table app_templates enable row level security;
DROP POLICY IF EXISTS "Anyone can view templates" ON app_templates;
create policy "Anyone can view templates" on app_templates for select using (true);
DROP POLICY IF EXISTS "Auth users can insert templates" ON app_templates;
create policy "Auth users can insert templates" on app_templates for insert with check (
  auth.uid() is not null
);


-- Migration: 20260525162018_b9ef5529-cfc8-4f53-8871-d31de06ba95e.sql
create table if not exists public.project_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  label text not null default 'Auto-save',
  schema jsonb not null,
  visual_edits jsonb,
  source text not null default 'auto',
  element_count integer default 0,
  screen_count integer default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_snapshots_project on public.project_snapshots(project_id, created_at desc);
alter table public.project_snapshots enable row level security;
DROP POLICY IF EXISTS "Users can view own project snapshots" ON public.project_snapshots;
create policy "Users can view own project snapshots" on public.project_snapshots for select using (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can insert own snapshots" ON public.project_snapshots;
create policy "Users can insert own snapshots" on public.project_snapshots for insert with check (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can delete own snapshots" ON public.project_snapshots;
create policy "Users can delete own snapshots" on public.project_snapshots for delete using (user_id = auth.uid());

create table if not exists public.project_file_overrides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  file_path text not null,
  content text not null,
  updated_at timestamptz not null default now(),
  unique(project_id, file_path)
);
alter table public.project_file_overrides enable row level security;
DROP POLICY IF EXISTS "Users can manage own file overrides" ON public.project_file_overrides;
create policy "Users can manage own file overrides" on public.project_file_overrides for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.project_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  key_name text not null,
  encrypted_value text not null,
  category text not null default 'custom',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, key_name)
);
alter table public.project_secrets enable row level security;
DROP POLICY IF EXISTS "Users can manage own project secrets" ON public.project_secrets;
create policy "Users can manage own project secrets" on public.project_secrets for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.app_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null,
  tags text[] default '{}',
  preview_image_url text,
  schema jsonb not null,
  feature_list text[] default '{}',
  author_id uuid,
  is_featured boolean default false,
  is_community boolean default false,
  use_count integer default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_templates_category on public.app_templates(category);
alter table public.app_templates enable row level security;
DROP POLICY IF EXISTS "Anyone can view templates" ON public.app_templates;
create policy "Anyone can view templates" on public.app_templates for select using (true);
DROP POLICY IF EXISTS "Auth users can insert templates" ON public.app_templates;
create policy "Auth users can insert templates" on public.app_templates for insert with check (auth.uid() is not null);

-- Migration: 20260525162520_f95c1a8b-0000-430d-b26b-eb61ea76cbc0.sql
-- 1. app_templates: lock down writes to author
drop policy if exists "Auth users can insert templates" on public.app_templates;
DROP POLICY IF EXISTS "Authors can insert own templates" ON public.app_templates;
create policy "Authors can insert own templates" on public.app_templates
  for insert with check (auth.uid() is not null and author_id = auth.uid());
DROP POLICY IF EXISTS "Authors can update own templates" ON public.app_templates;
create policy "Authors can update own templates" on public.app_templates
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());
DROP POLICY IF EXISTS "Authors can delete own templates" ON public.app_templates;
create policy "Authors can delete own templates" on public.app_templates
  for delete using (author_id = auth.uid());

-- 2. oauth_states: explicit service-role-only
DROP POLICY IF EXISTS "Service role manages oauth_states" ON public.oauth_states;
create policy "Service role manages oauth_states" on public.oauth_states
  for all using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

-- 3. Pin search_path + revoke public EXECUTE on internal email queue helpers
alter function public.enqueue_email(text, jsonb) set search_path = public, pgmq;
alter function public.read_email_batch(text, integer, integer) set search_path = public, pgmq;
alter function public.move_to_dlq(text, text, bigint, jsonb) set search_path = public, pgmq;
alter function public.delete_email(text, bigint) set search_path = public, pgmq;

revoke execute on function public.enqueue_email(text, jsonb) from anon, authenticated, public;
revoke execute on function public.read_email_batch(text, integer, integer) from anon, authenticated, public;
revoke execute on function public.move_to_dlq(text, text, bigint, jsonb) from anon, authenticated, public;
revoke execute on function public.delete_email(text, bigint) from anon, authenticated, public;

-- Migration: 20260525193500_add_project_figma_tokens.sql
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS figma_tokens jsonb;


-- Migration: 20260525194500_add_eas_test_runs.sql
CREATE TABLE IF NOT EXISTS public.eas_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  build_id uuid REFERENCES public.eas_builds(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  yaml_flow text NOT NULL,
  logs text,
  screenshots text[] DEFAULT '{}',
  error_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eas_test_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own test runs" ON public.eas_test_runs;
CREATE POLICY "Users can manage own test runs" ON public.eas_test_runs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- Migration: 20260525194953_6b77626b-c629-494d-bd76-76186681ef28.sql

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS figma_tokens JSONB;

CREATE TABLE IF NOT EXISTS public.eas_test_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  build_id TEXT,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  yaml_flow TEXT NOT NULL DEFAULT '',
  logs TEXT NOT NULL DEFAULT '',
  screenshots TEXT[] NOT NULL DEFAULT '{}',
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.eas_test_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_select_test_runs" ON public.eas_test_runs;
CREATE POLICY "own_select_test_runs" ON public.eas_test_runs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_insert_test_runs" ON public.eas_test_runs;
CREATE POLICY "own_insert_test_runs" ON public.eas_test_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_update_test_runs" ON public.eas_test_runs;
CREATE POLICY "own_update_test_runs" ON public.eas_test_runs FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own_delete_test_runs" ON public.eas_test_runs;
CREATE POLICY "own_delete_test_runs" ON public.eas_test_runs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS eas_test_runs_project_idx ON public.eas_test_runs(project_id, created_at DESC);


-- Migration: 20260526143747_7ad0a085-3bc9-4014-bf93-1689db33f99f.sql
DROP POLICY IF EXISTS "Public read app-assets" ON storage.objects;

-- Migration: 20260526144329_3f5c4d34-c3f1-4564-93ce-5917ef6e1d98.sql
select cron.schedule(
  'sweep-expired-subscriptions-hourly',
  '7 * * * *',
  $$ select public.sweep_expired_subscriptions(); $$
);

-- Migration: 20260526151007_6baab41b-2f44-4660-a40c-540366b7596d.sql

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


-- Migration: 20260528120000_fix_project_migrations_version_bigint.sql
-- project_migrations.version was created as `integer`, but
-- src/lib/backend-provision.functions.ts writes Date.now() into it.
-- Date.now() returns a millisecond epoch (~1.78e12 today), which overflows
-- a 4-byte integer and silently breaks the audit log on every applyBackendSchema
-- call. Widen to bigint.

ALTER TABLE public.project_migrations
  ALTER COLUMN version TYPE bigint USING version::bigint;


-- Migration: 20260528130000_drop_unused_project_monetization.sql
-- Drop the unused `project_monetization` table.
--
-- It was created by 20260524171340_*.sql with admob-specific columns
-- (banner/interstitial/rewarded Ã— iOS/Android), but the MonetizationPanel
-- (src/components/MonetizationPanel.tsx) ignores it entirely â€” it writes
-- every monetization key to `project_env_vars` instead, including
-- `monetization_provider` and `monetization_model`. The downstream consumer
-- (generateMonetizationLib in src/lib/export-project.ts) also expects the
-- env-var path.
--
-- Verified before drop: zero rows in production, zero writers in src/.
-- Only references were the migration itself and the auto-generated
-- supabase types.ts (which `supabase gen types` will refresh after this
-- migration is applied).
--
-- CASCADE removes the dependent index, trigger, and 4 RLS policies in one
-- statement; IF EXISTS makes the migration idempotent on re-apply.

DROP TABLE IF EXISTS public.project_monetization CASCADE;


-- Migration: 20260528140000_eas_test_runs_maestro_cloud.sql
-- Phase 1 of the Maestro Cloud integration. Adds tracking columns to
-- eas_test_runs so the trigger â†’ GitHub Actions â†’ Maestro Cloud â†’
-- webhook round-trip can correlate state back to a single row.
--
-- `github_workflow_run_id` â€” the GitHub Actions run id returned by
--   POST /repos/{owner}/{repo}/actions/workflows/{file}/dispatches.
--   Stored so the studio UI can deep-link into the build log.
--
-- `maestro_upload_id` â€” the Maestro Cloud upload id (top-level `id` field
--   in the webhook payload, per docs.maestro.dev). Stored on first webhook
--   so subsequent retries can be idempotent.
--
-- `queued_at` / `finished_at` â€” separates "row created" (created_at) from
--   the actual lifecycle timestamps. Useful for queue-latency metrics.
--
-- `status` values widen from {pending, running, passed, failed} to also
--   include {queued, cancelled, errored}; this matches what the GitHub
--   Actions + Maestro flow can land on. Using TEXT (not an enum) so future
--   states don't need a migration.
--
-- All columns are nullable so existing rows from the old simulation path
-- remain valid; nothing here drops or rewrites historical data.

ALTER TABLE public.eas_test_runs
  ADD COLUMN IF NOT EXISTS github_workflow_run_id text,
  ADD COLUMN IF NOT EXISTS maestro_upload_id text,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- Index the upload id so the webhook handler (which receives Maestro's
-- payload first, before any test run lookup) can find the row in O(log n).
CREATE INDEX IF NOT EXISTS eas_test_runs_maestro_upload_idx
  ON public.eas_test_runs (maestro_upload_id)
  WHERE maestro_upload_id IS NOT NULL;


-- Migration: 20260528150000_mcp_pats.sql
-- Personal Access Tokens for the MCP server (and future programmatic API).
--
-- We follow the standard "store only the hash, return the plaintext exactly
-- once" pattern (GitHub-style PATs):
--   - Plaintext: `mvbl_pat_{32 random bytes hex}` returned by the issue fn.
--   - Stored:    SHA-256 hex digest of the plaintext, plus the first 8 chars
--                of the plaintext as `prefix` so the UI can show
--                `mvbl_pat_abcd1234â€¦ (revoke?)` without storing the secret.
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
-- INSERT is performed server-side via supabaseAdmin only â€” the hash and
-- prefix are derived inside the issue server fn. No client INSERT policy.


-- Migration: 20260528160000_mcp_agent_threads.sql
-- In-studio MCP agent: persisted threads + messages.
--
-- The /agent route is a cross-project chat: the user talks to an LLM that
-- has access to the same 14-tool MCP_TOOLS dispatch table the external
-- MCP server exposes (list_projects, create_project, ingest_url, etc.).
--
-- Two tables so we can list threads in a sidebar without loading every
-- turn, and so the audit trail of "what the agent did" lives next to the
-- text it wrote.
--
-- Message rows store:
--   - role          'user' | 'assistant' | 'tool'
--   - content       the text body (markdown for user/assistant, JSON for
--                   tool â€” the args we sent or the result we got back)
--   - tool_calls    when an assistant turn invoked tools: a JSON array of
--                   { id, name, arguments } so the UI can render the
--                   inline timeline.
--   - tool_call_id  for role='tool' rows, references the assistant's
--                   tool_calls entry that triggered this result.

CREATE TABLE IF NOT EXISTS public.mcp_agent_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New thread',
  -- Model the user picked when starting the thread. Locked so a mid-thread
  -- model switch doesn't poison the tool-use trace; new thread = new model.
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS mcp_agent_threads_user_id_idx
  ON public.mcp_agent_threads (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.mcp_agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.mcp_agent_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content text NOT NULL DEFAULT '',
  -- JSON array on assistant rows describing tool invocations this turn made.
  -- Shape: [{ id: string, name: string, arguments: object }]
  tool_calls jsonb,
  -- For role='tool' rows: which assistant tool_calls entry produced this.
  tool_call_id text,
  -- For role='tool' rows: did the tool error? Lets the UI tint failures red
  -- without parsing the content string.
  is_error boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_agent_messages_thread_id_idx
  ON public.mcp_agent_messages (thread_id, created_at);

-- Keep updated_at fresh so the sidebar can order "recently used" threads.
CREATE OR REPLACE FUNCTION public.touch_mcp_agent_thread() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.mcp_agent_threads
     SET updated_at = now()
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_mcp_agent_thread ON public.mcp_agent_messages;
CREATE TRIGGER trg_touch_mcp_agent_thread
  AFTER INSERT ON public.mcp_agent_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_mcp_agent_thread();

ALTER TABLE public.mcp_agent_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_agent_messages ENABLE ROW LEVEL SECURITY;

-- Owners can do anything to their own threads + the messages inside them.
DROP POLICY IF EXISTS "own_threads_all" ON public.mcp_agent_threads;
CREATE POLICY "own_threads_all" ON public.mcp_agent_threads
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_messages_all" ON public.mcp_agent_messages;
CREATE POLICY "own_messages_all" ON public.mcp_agent_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- Migration: 20260528170000_plan_mode_and_skills.sql
-- Plan Mode + Skills for the in-studio agent.
--
-- Plan Mode (matches Lovable's Feb 2026 "Plan Mode"):
--   The user clicks "Plan" instead of "Send". The agent runs one turn
--   with a constrained system prompt: no tool calls, just a numbered
--   plan. The plan persists as an assistant message tagged is_plan=true
--   so the UI can render a "Run plan" CTA on rehydration. Approval is a
--   fresh user turn that quotes the plan back to the agent.
--
-- Skills (matches Lovable's May 2026 "Skills"):
--   Reusable instruction snippets the user names. In the composer the
--   user types `@skill-name` and on send we substitute the body. Scoped
--   to the owner only; sharing/workspace scope is a follow-up.

-- â”€â”€ Plan Mode â”€â”€
ALTER TABLE public.mcp_agent_messages
  ADD COLUMN IF NOT EXISTS is_plan boolean NOT NULL DEFAULT false;

-- â”€â”€ Skills â”€â”€
CREATE TABLE IF NOT EXISTS public.mcp_agent_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Stable handle the user types in chat: `@deploy-checklist`. Constrained
  -- so the `@`-substitution regex stays simple and predictable.
  name text NOT NULL,
  -- Free-form body the agent sees in place of `@name`. Capped at 8 KB so
  -- a single skill can't blow the model's context budget.
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mcp_agent_skills_name_format
    CHECK (name ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  CONSTRAINT mcp_agent_skills_body_size
    CHECK (char_length(body) BETWEEN 1 AND 8192),
  -- Per-user uniqueness so `@deploy-checklist` always resolves to one skill.
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS mcp_agent_skills_user_id_idx
  ON public.mcp_agent_skills (user_id, updated_at DESC);

-- Keep updated_at fresh on edits â€” the Settings UI orders by it.
CREATE OR REPLACE FUNCTION public.touch_mcp_agent_skill() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_mcp_agent_skill ON public.mcp_agent_skills;
CREATE TRIGGER trg_touch_mcp_agent_skill
  BEFORE UPDATE ON public.mcp_agent_skills
  FOR EACH ROW EXECUTE FUNCTION public.touch_mcp_agent_skill();

ALTER TABLE public.mcp_agent_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_skills_all" ON public.mcp_agent_skills;
CREATE POLICY "own_skills_all" ON public.mcp_agent_skills
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- Migration: 20260528180000_native_capabilities.sql
-- Native capabilities catalog â€” per-project record of which platform
-- features the user (or the agent) has wired in.
--
-- Stored as a jsonb array on the project row:
--   [
--     {
--       "id": "push_notifications",
--       "config": { "apns_team_id": "ABCD123", ... },
--       "added_at": "2026-05-28T12:00:00Z",
--       "added_by": "agent" | "user"
--     },
--     ...
--   ]
--
-- The Expo exporter reads this column at zip time and injects the right
-- dependencies, app.json plugins, Info.plist permission strings, and
-- AndroidManifest permissions. Keeping the catalog as data (rather than
-- hard-wiring it into export-expo.functions.ts) lets the agent add new
-- capabilities without any code changes â€” the catalog file owns the
-- "what gets emitted" spec.
--
-- Default '[]' so existing projects don't need a backfill.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS native_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Lightweight check so a future schema bump can rely on the shape.
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_native_capabilities_is_array;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_native_capabilities_is_array
  CHECK (jsonb_typeof(native_capabilities) = 'array');


-- Migration: 20260528190000_store_listing.sql
-- App Store / Play Console listing â€” per-project metadata + asset URLs.
--
-- Stored as a single jsonb column so we can extend without migration
-- churn (this listing schema will drift as Apple/Google change their
-- App Store Connect / Play Console requirements every six months).
--
-- Shape (informally â€” validated client-side):
--   {
--     "title": "Lemonade",
--     "subtitle": "Refresh your day.",
--     "description": "...",
--     "keywords": ["citrus", "summer", ...],
--     "primary_category": "Food & Drink",
--     "secondary_category": "Lifestyle",
--     "age_rating": "4+",
--     "support_url": "https://...",
--     "marketing_url": "https://...",
--     "privacy_policy_url": "https://...",
--     "whats_new": "Initial release.",
--     "icon_url": "https://...supabase.../project-attachments/.../icon.png",
--     "screenshots": [
--       { "device": "iphone_6_7", "url": "...", "ordinal": 0 },
--       { "device": "android_phone", "url": "...", "ordinal": 0 }
--     ]
--   }
--
-- The Expo exporter reads this column at zip time, downloads the icon
-- into `assets/icon.png`, sets `expo.icon` in app.json, and writes a
-- `store/listing.json` the user can paste into App Store Connect / Play
-- Console (and that a future eas-submit flow will consume directly).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS store_listing jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_store_listing_is_object;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_store_listing_is_object
  CHECK (jsonb_typeof(store_listing) = 'object');


-- Migration: 20260528200000_store_submissions.sql
-- Store credentials + submission tracking.
--
-- store_credentials   user-scoped App Store Connect + Play Console
--                     secrets. Encrypted at the application layer
--                     (libsodium / AES-256-GCM via the
--                     APP_SECRET_ENCRYPTION_KEY env var) so even DB
--                     readers without that key can't decrypt them.
--                     Per-user, not per-project â€” most users ship
--                     several apps under one Apple developer account.
--
-- store_submissions   per-build attempt to upload to TestFlight (iOS)
--                     or Play Internal Track (Android). v1 records the
--                     intent + status; a follow-up wires the actual
--                     `eas submit` invocation against a finished build.

CREATE TABLE IF NOT EXISTS public.store_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- â”€â”€â”€ Apple App Store Connect API â”€â”€â”€
  -- The Apple ASC API uses a JWT signed by a .p8 key. Three pieces:
  --   - issuer id (UUID-like)
  --   - key id (10-char alphanumeric)
  --   - key body (-----BEGIN PRIVATE KEY----- â€¦ PEM)
  asc_issuer_id text,
  asc_key_id text,
  /** AES-GCM ciphertext of the .p8 PEM. nonce|ciphertext|tag, base64. */
  asc_key_ciphertext text,

  -- â”€â”€â”€ Google Play Developer â”€â”€â”€
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

-- â”€â”€â”€ Submissions â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.store_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- 'ios' (TestFlight) or 'android' (Play Internal Track).
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  /** When the studio fully wires `eas submit`, this is the eas_builds
   *  row id whose artifact gets uploaded. v1 leaves it null â€” the user
   *  uploads the .ipa / .aab manually and the studio just tracks the
   *  metadata they're submitting against. */
  eas_build_id uuid,
  /** queued â†’ in_progress â†’ succeeded / failed / cancelled. */
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


-- Migration: 20260528210000_ota_publishes.sql
-- OTA publish history per project + channel.
--
-- "Channel" is Expo's terminology â€” a named bucket of updates the
-- shipped app subscribes to. Most apps end up with at least:
--   - preview      (TestFlight / internal track / dev devices)
--   - production   (App Store / Play Store users)
-- Free-form text in the column so users can add `staging`, `beta-2026`,
-- etc. without a migration.
--
-- Each row records ONE publish attempt. The status flow mirrors the
-- store-submissions table for consistency:
--   queued -> in_progress -> succeeded | failed | cancelled
--
-- `expo_update_group_id` is the id EAS Update assigns to the bundle
-- group once the publish lands; it's surfaced back in the UI as a deep
-- link to the EAS dashboard. Null until a future submit-runner worker
-- actually executes `eas update` and writes it back.
--
-- The EAS project id + owner (Expo username) live on `project_env_vars`
-- (variable names EAS_PROJECT_ID + EAS_OWNER). They aren't sensitive â€”
-- both are public in every built app's runtime URL â€” so storing them
-- alongside other env vars keeps the surface area small.

CREATE TABLE IF NOT EXISTS public.ota_publishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel ~ '^[a-z][a-z0-9_-]{0,40}$'),
  /** User-supplied release note shown in the EAS dashboard + in the
   *  studio's publish history. Capped at 4 KB. */
  message text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','in_progress','succeeded','failed','cancelled')),
  error_text text,
  /** EAS Update group id once the publish lands. */
  expo_update_group_id text,
  /** runtimeVersion that matched at publish time â€” copying it down
   *  means we can audit "which native build will receive this update"
   *  without having to look up the project's current export. */
  runtime_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS ota_publishes_project_idx
  ON public.ota_publishes (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ota_publishes_user_idx
  ON public.ota_publishes (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_ota_publish() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ota_publish ON public.ota_publishes;
CREATE TRIGGER trg_touch_ota_publish
  BEFORE UPDATE ON public.ota_publishes
  FOR EACH ROW EXECUTE FUNCTION public.touch_ota_publish();

ALTER TABLE public.ota_publishes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_ota_publishes_all" ON public.ota_publishes;
CREATE POLICY "own_ota_publishes_all" ON public.ota_publishes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- Migration: 20260531181513_26bc9f31-165c-4710-841b-9d0a6eca89f2.sql
ALTER TABLE public.eas_test_runs
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS github_workflow_run_id text,
  ADD COLUMN IF NOT EXISTS maestro_upload_id text;

-- Migration: 20260608005729_7d4af974-e9e1-4913-9c93-9fd35207f617.sql

-- Storage policies for app-assets bucket
CREATE POLICY "app_assets_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'app-assets');

CREATE POLICY "app_assets_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'app-assets' AND owner = auth.uid());

CREATE POLICY "app_assets_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'app-assets' AND owner = auth.uid())
WITH CHECK (bucket_id = 'app-assets' AND owner = auth.uid());

CREATE POLICY "app_assets_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'app-assets' AND owner = auth.uid());

-- Realtime: restrict broadcast/presence to authenticated users
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_can_use_realtime"
ON realtime.messages FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "authenticated_can_send_realtime"
ON realtime.messages FOR INSERT
TO authenticated
WITH CHECK (true);


-- Migration: 20260611003028_19c831b8-927c-4768-ad54-26ed6f30b39a.sql
ALTER TABLE public.subscriptions RENAME COLUMN paddle_subscription_id TO stripe_subscription_id;
ALTER TABLE public.subscriptions RENAME COLUMN paddle_customer_id TO stripe_customer_id;

-- Migration: 20260611003754_86d0c27b-2f61-4a7e-a8a5-d4bfc46772bd.sql

-- Grant initial credits on new profile
DROP TRIGGER IF EXISTS trg_profiles_insert_credits ON public.profiles;
CREATE TRIGGER trg_profiles_insert_credits
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_profile_insert_credits();

-- Reset credits whenever plan changes
DROP TRIGGER IF EXISTS trg_profiles_plan_change ON public.profiles;
CREATE TRIGGER trg_profiles_plan_change
AFTER UPDATE OF plan ON public.profiles
FOR EACH ROW
WHEN (NEW.plan IS DISTINCT FROM OLD.plan)
EXECUTE FUNCTION public.handle_profile_plan_change();

-- Sync profile.plan from subscription rows (handles purchase, upgrade, end-of-period downgrade)
DROP TRIGGER IF EXISTS trg_subscriptions_sync_plan ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_sync_plan
AFTER INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_plan_from_subscription();


-- Migration: 20260611004526_fa1a72a1-b053-4d4e-a1ec-66c24ce1a558.sql

-- 1. Force every new signup onto free_beta regardless of raw_user_meta_data.plan
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, display_name, plan)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    'free_beta'::public.plan_tier
  );
  return new;
end;
$function$;

-- 2. Treat past_due as active so the user keeps access during Stripe retries
CREATE OR REPLACE FUNCTION public.has_active_subscription(user_uuid uuid, check_env text DEFAULT 'live'::text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.subscriptions
    where user_id = user_uuid
    and environment = check_env
    and (
      (status in ('active', 'trialing', 'past_due')
        and (current_period_end is null or current_period_end > now()))
      or (status = 'canceled' and current_period_end > now())
    )
  );
$function$;

-- 3. Mirror past-due into the sweep so we don't auto-downgrade past_due users
CREATE OR REPLACE FUNCTION public.sync_profile_plan_from_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_plan public.plan_tier;
  v_has_access boolean;
begin
  v_plan := public.plan_from_price(new.price_id);
  if v_plan is null then
    return new;
  end if;

  v_has_access :=
    (new.status in ('active', 'trialing', 'past_due')
      and (new.current_period_end is null or new.current_period_end > now()))
    or (new.status = 'canceled'
      and new.current_period_end is not null
      and new.current_period_end > now());

  if v_has_access then
    update public.profiles
       set plan = v_plan, updated_at = now()
     where id = new.user_id and plan is distinct from v_plan;
  else
    update public.profiles
       set plan = 'free_beta', updated_at = now()
     where id = new.user_id and plan = v_plan;
  end if;

  return new;
end;
$function$;

-- 4. App-quota check used by project creation
CREATE OR REPLACE FUNCTION public.plan_app_quota(p_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  select case p_plan
    when 'free_beta' then 1
    when 'starter'   then 5
    when 'pro'       then -1   -- -1 = unlimited
    when 'scale'     then -1
    when 'business'  then -1
    else 1
  end;
$function$;

CREATE OR REPLACE FUNCTION public.can_create_project(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_plan text;
  v_quota int;
  v_used int;
begin
  select plan::text into v_plan from public.profiles where id = p_user;
  if v_plan is null then v_plan := 'free_beta'; end if;
  v_quota := public.plan_app_quota(v_plan);
  select count(*) into v_used from public.projects where user_id = p_user;
  if v_quota < 0 then
    return jsonb_build_object('ok', true, 'plan', v_plan, 'used', v_used, 'quota', null);
  end if;
  return jsonb_build_object(
    'ok', v_used < v_quota,
    'plan', v_plan,
    'used', v_used,
    'quota', v_quota
  );
end;
$function$;

-- 5. Enforce via trigger so client-side bypass is impossible
CREATE OR REPLACE FUNCTION public.enforce_project_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_plan text;
  v_quota int;
  v_used int;
begin
  select plan::text into v_plan from public.profiles where id = new.user_id;
  if v_plan is null then v_plan := 'free_beta'; end if;
  v_quota := public.plan_app_quota(v_plan);
  if v_quota < 0 then
    return new;
  end if;
  select count(*) into v_used from public.projects where user_id = new.user_id;
  if v_used >= v_quota then
    raise exception 'APP_QUOTA_EXCEEDED: Your % plan allows % app(s). Upgrade to create more.', v_plan, v_quota
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_projects_enforce_quota ON public.projects;
CREATE TRIGGER trg_projects_enforce_quota
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_project_quota();


-- Migration: 20260611010803_038c4dc3-1ebc-4c63-a3b5-7bb513b383ba.sql

CREATE OR REPLACE FUNCTION public.refund_ai_credits(
  p_user uuid,
  p_amount integer,
  p_reason text,
  p_project uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  bal public.ai_credit_balances%rowtype;
  v_to_daily int;
  v_to_monthly int;
  v_remaining int;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', true, 'refunded', 0);
  end if;

  select * into bal from public.ai_credit_balances where user_id = p_user for update;
  if not found then
    -- nothing to refund into; create a fresh balance and bail
    perform public.grant_ai_credits(p_user);
    return jsonb_build_object('ok', true, 'refunded', 0, 'note', 'no_prior_balance');
  end if;

  -- Refill daily bucket first (up to daily_granted), then monthly (up to monthly_granted)
  v_to_daily := least(p_amount, greatest(bal.daily_granted - bal.daily_remaining, 0));
  v_remaining := p_amount - v_to_daily;
  v_to_monthly := least(v_remaining, greatest(bal.monthly_granted - bal.monthly_remaining, 0));

  bal.daily_remaining   := bal.daily_remaining + v_to_daily;
  bal.monthly_remaining := bal.monthly_remaining + v_to_monthly;

  update public.ai_credit_balances
     set daily_remaining   = bal.daily_remaining,
         monthly_remaining = bal.monthly_remaining,
         updated_at        = now()
   where user_id = p_user;

  insert into public.ai_credit_ledger (user_id, project_id, amount, reason, daily_after, monthly_after)
    values (p_user, p_project, -(v_to_daily + v_to_monthly), 'refund:' || p_reason, bal.daily_remaining, bal.monthly_remaining);

  return jsonb_build_object(
    'ok', true,
    'refunded', v_to_daily + v_to_monthly,
    'daily_remaining', bal.daily_remaining,
    'monthly_remaining', bal.monthly_remaining
  );
end;
$$;


-- Migration: 20260623013100_demo_user_quota.sql
-- Allow the demo user (demo@mobivable.com) to create up to 10 apps
-- while keeping existing plan-based quotas for all other users.

CREATE OR REPLACE FUNCTION public.enforce_project_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_plan  text;
  v_quota int;
  v_used  int;
  v_email text;
begin
  -- Look up the user's email to check for demo account
  select email into v_email from auth.users where id = new.user_id;

  -- Demo user gets a special quota of 10 apps
  if v_email = 'demo@mobivable.com' then
    select count(*) into v_used from public.projects where user_id = new.user_id;
    if v_used >= 10 then
      raise exception 'APP_QUOTA_EXCEEDED: Demo account allows 10 app(s). Sign up for your own account to create more.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- Standard plan-based quota for all other users
  select plan::text into v_plan from public.profiles where id = new.user_id;
  if v_plan is null then v_plan := 'free_beta'; end if;
  v_quota := public.plan_app_quota(v_plan);
  if v_quota < 0 then
    return new;
  end if;
  select count(*) into v_used from public.projects where user_id = new.user_id;
  if v_used >= v_quota then
    raise exception 'APP_QUOTA_EXCEEDED: Your % plan allows % app(s). Upgrade to create more.', v_plan, v_quota
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;



