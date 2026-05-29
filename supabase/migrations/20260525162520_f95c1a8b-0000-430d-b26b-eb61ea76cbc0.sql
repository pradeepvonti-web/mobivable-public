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