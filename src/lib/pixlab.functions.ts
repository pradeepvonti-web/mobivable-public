import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PIXLAB_BASE = "https://api.pixlab.io/v1";

function requireKey(): string {
  const key = process.env.PIXLAB_API_KEY;
  if (!key) {
    throw new Error(
      "PIXLAB_API_KEY is not configured. Add it as a runtime secret to enable PixLab features."
    );
  }
  return key;
}

async function callPixlab(
  endpoint: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const key = requireKey();
  const res = await fetch(`${PIXLAB_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, key }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || (typeof data.status === "number" && data.status !== 200)) {
    const msg =
      (typeof data.error === "string" && data.error) ||
      `PixLab ${endpoint} failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

/** Remove background — returns a hosted PixLab URL of the transparent result. */
export const pixlabBgRemove = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ imageUrl: z.string().url().max(2048) }).parse
  )
  .handler(async ({ data }) => {
    const out = await callPixlab("bgremove", { img: data.imageUrl });
    return { url: out.link as string | undefined };
  });

/** Text → image generation. */
export const pixlabGenerate = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      prompt: z.string().min(2).max(1000),
      width: z.number().int().min(256).max(1536).optional(),
      height: z.number().int().min(256).max(1536).optional(),
    }).parse
  )
  .handler(async ({ data }) => {
    const out = await callPixlab("gen", {
      text: data.prompt,
      width: data.width ?? 1024,
      height: data.height ?? 1024,
    });
    return { url: out.link as string | undefined };
  });

/** Apply a smart filter (blur, grayscale, oilpaint, sepia, sharpen, etc.). */
export const pixlabFilter = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      imageUrl: z.string().url().max(2048),
      filter: z.enum([
        "blur",
        "grayscale",
        "oilpaint",
        "sepia",
        "sharpen",
        "edge",
        "emboss",
        "invert",
      ]),
      intensity: z.number().min(0).max(100).optional(),
    }).parse
  )
  .handler(async ({ data }) => {
    const out = await callPixlab(data.filter, {
      img: data.imageUrl,
      ...(data.intensity != null ? { sigma: data.intensity } : {}),
    });
    return { url: out.link as string | undefined };
  });

/** Merge a screenshot onto a device frame / background (mockup composer). */
export const pixlabMockup = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      screenshotUrl: z.string().url().max(2048),
      frameUrl: z.string().url().max(2048),
      x: z.number().int().min(0).max(4096).optional(),
      y: z.number().int().min(0).max(4096).optional(),
      opacity: z.number().min(0).max(100).optional(),
    }).parse
  )
  .handler(async ({ data }) => {
    const out = await callPixlab("merge", {
      src: data.frameUrl,
      cap: data.screenshotUrl,
      x: data.x ?? 0,
      y: data.y ?? 0,
      opacity: data.opacity ?? 100,
    });
    return { url: out.link as string | undefined };
  });
