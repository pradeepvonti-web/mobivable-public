
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS agents_md TEXT;

INSERT INTO public.app_settings (key, value)
VALUES ('agents_bible', '{"content": "", "fileName": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;
