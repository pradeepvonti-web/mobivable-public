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

type StoredSnackPayload = {
  hashId: string;
  dependencies: Record<string, { version: string }>;
  sdkVersion: string;
};

const SDK_VERSION = "52.0.0";
const SnackGenerationSchema = z.object({
  files: z.record(z.string()),
  dependencies: z.record(z.string()).default({}),
});

function parseProjectResult(result: unknown): Record<string, unknown> {
  if (!result) return {};
  if (typeof result === "object" && !Array.isArray(result)) {
    return result as Record<string, unknown>;
  }
  if (typeof result !== "string") return {};

  try {
    const parsed = JSON.parse(result);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}




function extractJSON(raw: string) {
  let cleaned = raw
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();

  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const objStart = cleaned.indexOf("{");
    const arrStart = cleaned.indexOf("[");
    const isArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
    const start = isArray ? arrStart : objStart;
    const end = isArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");

    if (start !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    } else {
      throw new Error("No valid JSON found in AI response");
    }
  }

  return JSON.parse(cleaned);
}

function normalizeSnackOutput(parsed: z.infer<typeof SnackGenerationSchema>) {
  if (!parsed.files["App.tsx"]) {
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

// ---------- AI codegen ----------
async function generateExpoFilesFromPrompt(opts: {
  prompt: string;
  appName: string;
  schema: unknown;
}): Promise<{ files: SnackFileMap; dependencies: Record<string, { version: string }> }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");

  const system = `You output ONLY JSON. Generate a tiny Expo SDK ${SDK_VERSION} app.
Shape: {"files":{"App.tsx":"<full TSX>"},"dependencies":{}}
Rules:
- ONE file: App.tsx only.
- Under 2KB. Single screen, no navigation.
- Use only react-native + expo-linear-gradient + @expo/vector-icons (already in Snack — leave dependencies empty {}).
- StyleSheet, polished modern UI, gradient background, nice typography.
- No comments, no markdown fences.`;

  const userMsg = `Build: ${opts.appName} — ${opts.prompt}`.slice(0, 500);


  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";

  try {
    return normalizeSnackOutput(SnackGenerationSchema.parse(extractJSON(content)));
  } catch (e) {
    throw new Error(`AI output parse failed: ${(e as Error).message}. Raw: ${content.slice(0, 200)}`);
  }
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

    const projectResult = parseProjectResult(project.result);

    const { files, dependencies } = await generateExpoFilesFromPrompt({
      prompt: project.prompt ?? "",
      appName: project.name ?? "Mobivable App",
      schema: projectResult.schema ?? {},
    });

    const { hashId } = await saveSnack({
      name: project.name ?? "Mobivable App",
      description: (project.prompt ?? "").slice(0, 200),
      files,
      dependencies,
    });

    const payload: SnackPayload = { hashId, files, dependencies, sdkVersion: SDK_VERSION };
    const storedSnack: StoredSnackPayload = {
      hashId,
      dependencies,
      sdkVersion: SDK_VERSION,
    };
    const nextResult = { ...projectResult, snack: storedSnack };

    const { error: upErr } = await supabaseAdmin
      .from("projects")
      .update({ result: JSON.stringify(nextResult), updated_at: new Date().toISOString() })
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
    const storedSnack = (parseProjectResult(project.result).snack as StoredSnackPayload | undefined) ?? null;
    return {
      snack: storedSnack
        ? {
            ...storedSnack,
            files: { "App.tsx": { type: "CODE", contents: "// Source available in Expo Snack" } },
          }
        : null,
    };
  });
