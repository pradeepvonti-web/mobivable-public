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