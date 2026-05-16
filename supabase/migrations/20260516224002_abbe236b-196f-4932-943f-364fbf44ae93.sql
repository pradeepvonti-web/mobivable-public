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