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

CREATE POLICY "Owners can view their project messages"
ON public.project_messages FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Owners can insert their project messages"
ON public.project_messages FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners can delete their project messages"
ON public.project_messages FOR DELETE
TO authenticated
USING (user_id = auth.uid());