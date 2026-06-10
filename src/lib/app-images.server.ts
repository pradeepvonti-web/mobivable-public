import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { MobileAppSchema, MElement } from "@/lib/mobile-app-schema";
import { resolveTheme } from "@/lib/mobile-theme";
import { consumeOrThrow, CREDIT_COSTS } from "./credits.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const MAX_IMAGES = 8;
const MAX_IMAGES_PER_SCREEN = 4;
const CONCURRENCY = 3;
const BUCKET = "app-assets";

type PromptSite = {
  prompt: string;
  apply: (url: string) => void;
};

function walkPrompts(schema: MobileAppSchema, sites: PromptSite[], screenId?: string) {
  const visit = (els?: MElement[]) => {
    if (!els) return;
    for (const el of els) {
      if (!el || typeof el !== "object") continue;
      const p = el.props as Record<string, unknown> | undefined;
      if (!p) continue;
      if (el.type === "image" && typeof p.prompt === "string" && !p.src) {
        sites.push({ prompt: p.prompt, apply: (u) => { p.src = u; } });
      } else if ((el.type === "hero-banner" || el.type === "parallax-hero" || el.type === "feature-showcase" || el.type === "onboarding-slide" || el.type === "glass-card") && typeof p.prompt === "string" && !p.image) {
        sites.push({ prompt: p.prompt, apply: (u) => { p.image = u; } });
      } else if (el.type === "carousel" && Array.isArray(p.items)) {
        for (const it of p.items as Array<Record<string, unknown>>) {
          if (typeof it.prompt === "string" && !it.image) {
            sites.push({ prompt: it.prompt, apply: (u) => { it.image = u; } });
          }
        }
      } else if (el.type === "grid-cards" && Array.isArray(p.items)) {
        for (const it of p.items as Array<Record<string, unknown>>) {
          if (typeof it.prompt === "string" && !it.image) {
            sites.push({ prompt: it.prompt, apply: (u) => { it.image = u; } });
          }
        }
      }

      const children = (p as { children?: MElement[] }).children;
      if (Array.isArray(children)) visit(children);
    }
  };
  for (const s of schema.screens ?? []) {
    if (screenId && s.id !== screenId) continue;
    visit(s.elements);
  }
}

async function hashKey(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateOne(prompt: string, paletteHint: string): Promise<{ ok: true; b64: string } | { ok: false; error: string }> {
  const finalPrompt = `${prompt}\n\nColor palette to harmonize with: ${paletteHint}. Photographic / illustrative quality, high detail, no text, no watermarks.`;
  const key = typeof process !== "undefined" ? process.env?.LOVABLE_API_KEY : undefined;

  if (key) {
    const models = ["google/gemini-3.1-flash-image-preview", "google/gemini-2.5-flash-image"];
    for (const model of models) {
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: finalPrompt }],
            modalities: ["image", "text"],
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
          };
          const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (url && url.startsWith("data:image/")) {
            const b64 = url.split(",")[1] ?? "";
            if (b64) return { ok: true, b64 };
          }
        }
      } catch {
        // try next
      }
    }
  }

  try {
    const { callAIImage } = await import("./ai-provider");
    const result = await callAIImage(finalPrompt);
    if (!result.ok) return { ok: false, error: result.error };
    const b64 = result.dataUrl.split(",")[1] ?? "";
    if (!b64) return { ok: false, error: "Empty image data" };
    return { ok: true, b64 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "image fetch failed" };
  }
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type AppImagesResult =
  | { ok: true; generated: number; cached: number; failed: number; skipped: number }
  | { ok: false; error: string };

export async function runAppImagesInternal(args: {
  supabase: SupabaseClient<Database>;
  userId: string;
  projectId: string;
  screenId?: string;
}): Promise<AppImagesResult> {
  const { supabase, userId, projectId, screenId } = args;

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, result, user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!project || project.user_id !== userId) return { ok: false, error: "Forbidden" };
  if (!project.result) return { ok: false, error: "No schema yet" };

  let schema: MobileAppSchema;
  try {
    schema = JSON.parse(project.result) as MobileAppSchema;
  } catch {
    return { ok: false, error: "Schema not valid JSON" };
  }

  const sites: PromptSite[] = [];
  walkPrompts(schema, sites, screenId);
  const cap = screenId ? MAX_IMAGES_PER_SCREEN : MAX_IMAGES;
  const queue = sites.slice(0, cap);
  if (queue.length === 0) return { ok: true, generated: 0, cached: 0, failed: 0, skipped: 0 };

  try {
    await consumeOrThrow(userId, CREDIT_COSTS.image * queue.length, "app_images", project.id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const theme = resolveTheme(schema.theme);
  const palette = [theme.primary, theme.accent, theme.background].join(", ");

  let generated = 0, cached = 0, failed = 0;

  const run = async (site: PromptSite) => {
    const key = await hashKey(`${site.prompt}|${palette}`);
    const path = `${projectId}/${key}.png`;

    let hasStorage = false;
    try {
      const { data: existing } = await supabaseAdmin.storage.from(BUCKET).list(projectId, { search: `${key}.png` });
      if (existing && existing.some((f) => f.name === `${key}.png`)) {
        const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
        site.apply(pub.publicUrl);
        cached++;
        return;
      }
      hasStorage = true;
    } catch {
      // skip cache
    }

    const r = await generateOne(site.prompt, palette);
    if (!r.ok) { failed++; console.error("[appImages] gen fail:", r.error); return; }

    if (hasStorage) {
      try {
        const bytes = b64ToBytes(r.b64);
        const up = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
          contentType: "image/png", upsert: true,
        });
        if (!up.error) {
          const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
          site.apply(pub.publicUrl);
          generated++;
          return;
        }
      } catch {
        // fall through
      }
    }

    site.apply(`data:image/png;base64,${r.b64}`);
    generated++;
  };

  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    await Promise.all(queue.slice(i, i + CONCURRENCY).map(run));
  }

  const skipped = sites.length - queue.length;

  await supabase
    .from("projects")
    .update({ result: JSON.stringify(schema) })
    .eq("id", project.id);

  return { ok: true, generated, cached, failed, skipped };
}
