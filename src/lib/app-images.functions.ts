import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { MobileAppSchema, MElement } from "@/lib/mobile-app-schema";
import { resolveTheme } from "@/lib/mobile-theme";

const MAX_IMAGES = 8;
const CONCURRENCY = 3;
const BUCKET = "app-assets";

type PromptSite = {
  prompt: string;
  apply: (url: string) => void;
};

function walkPrompts(schema: MobileAppSchema, sites: PromptSite[]) {
  const visit = (els?: MElement[]) => {
    if (!els) return;
    for (const el of els) {
      if (!el || typeof el !== "object") continue;
      const p = el.props as Record<string, unknown> | undefined;
      if (!p) continue;
      if (el.type === "image" && typeof p.prompt === "string" && !p.src) {
        sites.push({ prompt: p.prompt, apply: (u) => { p.src = u; } });
      } else if (el.type === "hero-banner" && typeof p.prompt === "string" && !p.image) {
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
      // Recurse into card/section children
      const children = (p as { children?: MElement[] }).children;
      if (Array.isArray(children)) visit(children);
    }
  };
  for (const s of schema.screens ?? []) visit(s.elements);
}

async function hashKey(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateOne(prompt: string, paletteHint: string): Promise<{ ok: true; b64: string } | { ok: false; error: string }> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ok: false, error: "LOVABLE_API_KEY missing" };
  const finalPrompt = `${prompt}\n\nColor palette to harmonize with: ${paletteHint}. Photographic / illustrative quality, high detail, no text, no watermarks.`;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content: finalPrompt }],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Gateway ${res.status}: ${body.slice(0, 160)}` };
    }
    const json = (await res.json()) as {
      choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
    };
    const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url || !url.startsWith("data:image/")) return { ok: false, error: "No image returned" };
    const b64 = url.split(",")[1] ?? "";
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

export const generateAppImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project, error } = await supabase
      .from("projects")
      .select("id, result, user_id")
      .eq("id", data.projectId)
      .maybeSingle();

    if (error) return { ok: false as const, error: error.message };
    if (!project || project.user_id !== userId) return { ok: false as const, error: "Forbidden" };
    if (!project.result) return { ok: false as const, error: "No schema yet" };

    let schema: MobileAppSchema;
    try {
      schema = JSON.parse(project.result) as MobileAppSchema;
    } catch {
      return { ok: false as const, error: "Schema not valid JSON" };
    }

    const sites: PromptSite[] = [];
    walkPrompts(schema, sites);
    const queue = sites.slice(0, MAX_IMAGES);
    if (queue.length === 0) return { ok: true as const, generated: 0, cached: 0, failed: 0, skipped: 0 };

    const theme = resolveTheme(schema.theme);
    const palette = [theme.primary, theme.accent, theme.background].join(", ");

    let generated = 0, cached = 0, failed = 0;

    const run = async (site: PromptSite) => {
      const key = await hashKey(`${site.prompt}|${palette}`);
      const path = `${data.projectId}/${key}.png`;

      // Cache check
      const { data: existing } = await supabaseAdmin.storage.from(BUCKET).list(data.projectId, { search: `${key}.png` });
      if (existing && existing.some((f) => f.name === `${key}.png`)) {
        const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
        site.apply(pub.publicUrl);
        cached++;
        return;
      }

      const r = await generateOne(site.prompt, palette);
      if (!r.ok) { failed++; console.error("[appImages] gen fail:", r.error); return; }

      const bytes = b64ToBytes(r.b64);
      const up = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
        contentType: "image/png", upsert: true,
      });
      if (up.error) { failed++; console.error("[appImages] upload fail:", up.error.message); return; }

      const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
      site.apply(pub.publicUrl);
      generated++;
    };

    // Process in batches of CONCURRENCY
    for (let i = 0; i < queue.length; i += CONCURRENCY) {
      await Promise.all(queue.slice(i, i + CONCURRENCY).map(run));
    }

    const skipped = sites.length - queue.length;

    // Persist updated schema
    await supabase
      .from("projects")
      .update({ result: JSON.stringify(schema) })
      .eq("id", project.id);

    return { ok: true as const, generated, cached, failed, skipped };
  });
