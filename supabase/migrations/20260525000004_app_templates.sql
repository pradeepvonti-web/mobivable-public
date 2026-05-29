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
