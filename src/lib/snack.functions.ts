import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- Types ----------
export type SnackFile = { type: "CODE" | "ASSET"; contents: string };
export type SnackFileMap = Record<string, SnackFile>;
export type SnackPayload = {
  hashId: string;
  files: SnackFileMap;
  dependencies: Record<string, { version: string }>;
  sdkVersion: string;
};

const SDK_VERSION = "52.0.0";

// ---------- AI codegen ----------
async function generateExpoFilesFromPrompt(opts: {
  prompt: string;
  appName: string;
  schema: unknown;
}): Promise<{ files: SnackFileMap; dependencies: Record<string, { version: string }> }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");

  const system = `You are an expert React Native + Expo engineer.
Generate a COMPLETE runnable Expo SDK ${SDK_VERSION} app as a JSON file map.
Rules:
- Output ONLY valid JSON matching: { "files": { "<path>": "<full file contents>" }, "dependencies": { "<pkg>": "<semver>" } }
- ALWAYS include "App.tsx" as the entry point.
- Use only packages available on Expo Snack (react-native, expo, react-navigation, react-native-paper, expo-router, @expo/vector-icons, expo-linear-gradient).
- Keep dependency count minimal. Do not include react/react-native/expo in dependencies (Snack provides them).
- All screens must be wired through React Navigation. Provide at least Home + 2 inner screens.
- Use StyleSheet, no Tailwind. Modern, polished UI with good spacing/typography.
- No native modules requiring config plugins.
- Do not include comments-only files.`;

  const userMsg = `App name: ${opts.appName}
User prompt: ${opts.prompt}
Keep total output under 8 files, ~6KB max.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
    }),
  });


  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  let parsed: { files?: Record<string, string>; dependencies?: Record<string, string> };
  // Strip markdown fences and extract first JSON object
  const cleaned = content
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  const jsonStr = jsonStart >= 0 && jsonEnd > jsonStart ? cleaned.slice(jsonStart, jsonEnd + 1) : cleaned;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`AI returned non-JSON output: ${content.slice(0, 200)}`);
  }

  if (!parsed.files || !parsed.files["App.tsx"]) {
    throw new Error("AI output missing App.tsx");
  }

  const files: SnackFileMap = {};
  for (const [path, contents] of Object.entries(parsed.files)) {
    files[path] = { type: "CODE", contents };
  }
  const dependencies: Record<string, { version: string }> = {};
  for (const [name, version] of Object.entries(parsed.dependencies ?? {})) {
    dependencies[name] = { version: String(version) };
  }
  return { files, dependencies };
}

// ---------- Snack save ----------
async function saveSnack(opts: {
  name: string;
  description: string;
  files: SnackFileMap;
  dependencies: Record<string, { version: string }>;
}): Promise<{ id: string; hashId: string }> {
  const body = {
    manifest: {
      name: opts.name,
      description: opts.description,
      sdkVersion: SDK_VERSION,
      dependencies: opts.dependencies,
    },
    code: opts.files,
    dependencies: opts.dependencies,
  };

  const res = await fetch("https://exp.host/--/api/v2/snack/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Snack-Api-Version": "3.0.0",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Snack save ${res.status}: ${txt.slice(0, 400)}`);
  }
  const data = (await res.json()) as { id?: string; hashId?: string };
  const id = data.id ?? data.hashId;
  const hashId = data.hashId ?? data.id;
  if (!id || !hashId) throw new Error("Snack save returned no id");
  return { id, hashId };
}

// ---------- Server functions ----------
const GenerateInput = z.object({ projectId: z.string().uuid() });

export const generateExpoSnack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: project, error } = await supabaseAdmin
      .from("projects")
      .select("id, name, prompt, result, user_id")
      .eq("id", data.projectId)
      .single();
    if (error || !project) throw new Error("Project not found");
    if (project.user_id !== userId) throw new Error("Forbidden");

    const { files, dependencies } = await generateExpoFilesFromPrompt({
      prompt: project.prompt ?? "",
      appName: project.name ?? "Mobivable App",
      schema: (project.result as { schema?: unknown } | null)?.schema ?? {},
    });

    const { hashId } = await saveSnack({
      name: project.name ?? "Mobivable App",
      description: (project.prompt ?? "").slice(0, 200),
      files,
      dependencies,
    });

    const payload: SnackPayload = { hashId, files, dependencies, sdkVersion: SDK_VERSION };
    const nextResult = { ...((project.result as object | null) ?? {}), snack: payload };

    const { error: upErr } = await supabaseAdmin
      .from("projects")
      .update({ result: nextResult as unknown as string, updated_at: new Date().toISOString() })
      .eq("id", project.id);
    if (upErr) throw new Error(`DB update failed: ${upErr.message}`);

    return payload;
  });

const GetInput = z.object({ projectId: z.string().uuid() });
export const getExpoSnack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: project, error } = await supabaseAdmin
      .from("projects")
      .select("result, user_id")
      .eq("id", data.projectId)
      .single();
    if (error || !project) throw new Error("Project not found");
    if (project.user_id !== userId) throw new Error("Forbidden");
    const snack = (project.result as { snack?: SnackPayload } | null)?.snack ?? null;
    return { snack };
  });
