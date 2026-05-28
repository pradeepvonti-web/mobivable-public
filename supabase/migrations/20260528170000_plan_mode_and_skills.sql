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

-- ── Plan Mode ──
ALTER TABLE public.mcp_agent_messages
  ADD COLUMN IF NOT EXISTS is_plan boolean NOT NULL DEFAULT false;

-- ── Skills ──
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

-- Keep updated_at fresh on edits — the Settings UI orders by it.
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

CREATE POLICY "own_skills_all" ON public.mcp_agent_skills
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
