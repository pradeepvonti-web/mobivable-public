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
--                   tool — the args we sent or the result we got back)
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
CREATE POLICY "own_threads_all" ON public.mcp_agent_threads
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_messages_all" ON public.mcp_agent_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
