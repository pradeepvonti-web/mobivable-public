ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-attachments', 'project-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "project_attachments_select_own"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "project_attachments_insert_own"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "project_attachments_update_own"
ON storage.objects FOR UPDATE
USING (bucket_id = 'project-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "project_attachments_delete_own"
ON storage.objects FOR DELETE
USING (bucket_id = 'project-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);