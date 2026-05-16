ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS result text,
  ADD COLUMN IF NOT EXISTS error_text text;