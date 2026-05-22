import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAI } from "./ai-provider";

const AGENTS_MD_SYSTEM_PROMPT = `You are a senior mobile engineer writing an AGENTS.md guide that another AI agent will read before every feature it builds.

You will receive:
1. THE BIBLE — the project's coding/workflow guide (Practical Vibe Coding).
2. PROJECT INFO — the app's name, one-line description, and feature list (extracted from the user's prompt).

Your job: produce ONE complete AGENTS.md file tailored to this specific project. Use the structure of the user's template (Project Overview, Tech Stack, Development Philosophy, Decision Making, Architecture, UI Rules, Styling Rules, Image Rule, State Management, TypeScript, Feature Implementation, Secrets, Authentication, Communication, Final Reminder).

Rules:
- Replace [APP_NAME], [ONE_LINE_DESCRIPTION], [FEATURE_LIST], [EXAMPLE_COMPONENT_NAMES], [EXAMPLE_STATE_FIELDS] with concrete values inferred from the project info.
- Keep the bible's principles (small steps, read AGENTS.md first, no overengineering, NativeWind first, etc.).
- Default stack: Expo, React Native, TypeScript, Expo Router, NativeWind, Zustand, AsyncStorage, Clerk — unless the project clearly needs otherwise.
- Output PURE markdown only. No code fences around the whole file, no preamble, no "Here is your Agents.md".`;

export const generateAgentsMd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error } = await supabase
      .from("projects")
      .select("id, name, prompt, model, user_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (error) return { ok: false as const, error: error.message };
    if (!project) return { ok: false as const, error: "Project not found" };
    if (project.user_id !== userId)
      return { ok: false as const, error: "Forbidden" };

    const { data: bibleRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "agents_bible")
      .maybeSingle();

    const bible =
      (bibleRow?.value as { content?: string } | null)?.content?.trim() ?? "";

    const userPrompt = `THE BIBLE:\n${bible || "(no bible uploaded yet — use Practical Vibe Coding defaults)"}\n\n---\n\nPROJECT INFO:\nName: ${project.name}\nPrompt / description: ${project.prompt}\n\nGenerate the AGENTS.md file now.`;

    const r = await callAI(AGENTS_MD_SYSTEM_PROMPT, userPrompt, project.model);
    if (!r.ok) return { ok: false as const, error: r.error };

    const md = r.text.trim();
    const { error: upErr } = await supabase
      .from("projects")
      .update({ agents_md: md })
      .eq("id", project.id);

    if (upErr) return { ok: false as const, error: upErr.message };
    return { ok: true as const, agentsMd: md };
  });

export const getAgentsMd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: project, error } = await supabase
      .from("projects")
      .select("agents_md, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    if (!project) return { ok: false as const, error: "Project not found" };
    if (project.user_id !== userId)
      return { ok: false as const, error: "Forbidden" };
    return { ok: true as const, agentsMd: project.agents_md ?? "" };
  });

// ─── Bible (admin-only) ──────────────────────────────────────────

export const getAgentsBible = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("app_settings")
      .select("value, updated_at")
      .eq("key", "agents_bible")
      .maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    const value = (data?.value as { content?: string; fileName?: string | null } | null) ?? {
      content: "",
      fileName: null,
    };
    return {
      ok: true as const,
      content: value.content ?? "",
      fileName: value.fileName ?? null,
      updatedAt: data?.updated_at ?? null,
    };
  });

export const saveAgentsBible = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        content: z.string().min(1).max(500_000),
        fileName: z.string().max(255).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return { ok: false as const, error: "Admin only" };

    const { error } = await supabase
      .from("app_settings")
      .upsert(
        {
          key: "agents_bible",
          value: { content: data.content, fileName: data.fileName ?? null },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
