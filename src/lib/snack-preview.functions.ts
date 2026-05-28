/**
 * Snack-based device preview.
 *
 * Why Snack rather than Appetize:
 *   - Free (no $200/mo Appetize bill until we scale beyond Snack's quotas).
 *   - Real React Native runtime — Expo Go pairing renders on the user's
 *     own iPhone/Android. Snack's `previewQRCode=true` flag wires this
 *     automatically.
 *   - Works with the same Expo template the studio already exports, so
 *     "preview on device" and "export to a runnable repo" stay in sync.
 *
 * Flow:
 *   1. Studio calls `createSnackSession({ projectId })`.
 *   2. We pull the project's theme + first-screen title and template a
 *      minimal Expo 51 App.tsx + package.json.
 *   3. POST to `https://exp.host/--/api/v2/snack/save` (no API key —
 *      Snack accepts anonymous saves with a 24-hour TTL, which is fine
 *      for a preview surface).
 *   4. Return `{ hashId, embedUrl }`. The /agent UI swaps the Flutter
 *      iframe for `<iframe src={embedUrl}>`.
 *
 * NOTE: This is a "theme + name on a real device" preview, not a full
 * schema renderer. A proper Mobile-App-Schema → RN component renderer
 * is a separate (larger) project — same dependency as exportExpoProject
 * relies on for its real-output story.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseAppSchema } from "@/lib/code-gen";
import { renderSchemaToRn, type SchemaTheme } from "@/lib/rn-renderer";

const SNACK_SAVE_URL = "https://exp.host/--/api/v2/snack/save";
const SNACK_SDK_VERSION = "51.0.0";

interface ParsedSchemaForSnack {
  theme: SchemaTheme;
  firstScreen: {
    id?: string;
    title?: string;
    elements?: unknown[];
    scrollable?: boolean;
  } | null;
}

function extractForSnack(
  prompt: string,
  schemaRaw: string | null,
): ParsedSchemaForSnack {
  const schema = parseAppSchema(schemaRaw ?? "");
  const firstScreen = schema?.screens?.[0] ?? null;
  // Theme heuristics — same approach exportExpoProject uses to lift colors
  // out of the designer agent's markdown. Keeps the two surfaces in sync.
  const hexFromPrompt = (prompt + " " + (schemaRaw ?? "")).match(/#[0-9a-fA-F]{6}/g) ?? [];
  return {
    theme: {
      primary: hexFromPrompt[2] || hexFromPrompt[0] || "#6366f1",
      background: hexFromPrompt[0] || "#0a0a0f",
      card: hexFromPrompt[1] || "#161623",
      text: hexFromPrompt[4] || "#ffffff",
      muted: hexFromPrompt[5] || "#9ca3af",
    },
    firstScreen,
  };
}

function buildSnackFiles(args: {
  name: string;
  prompt: string;
  schema: ParsedSchemaForSnack;
}): { code: Record<string, { contents: string; type: "CODE" }>; dependencies: Record<string, string> } {
  const { name, schema } = args;
  // Real schema-to-RN render. The shared rn-renderer is the single
  // source of truth — Snack preview, the Expo export's Home, and any
  // future device-capture pipeline all go through it so they paint the
  // same thing.
  const rendered = renderSchemaToRn({
    appName: name,
    theme: schema.theme,
    screen: schema.firstScreen ?? { title: "Home", elements: [] },
  });
  return {
    code: { "App.tsx": { contents: rendered.appTsx, type: "CODE" } },
    dependencies: rendered.dependencies,
  };
}

export const createSnackSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project } = await supabase
      .from("projects")
      .select("id, name, prompt, result, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || project.user_id !== userId) {
      return { ok: false as const, error: "Project not found." };
    }

    const schema = extractForSnack(project.prompt ?? "", project.result ?? null);
    const { code, dependencies } = buildSnackFiles({
      name: project.name || "Mobivable App",
      prompt: project.prompt ?? "",
      schema,
    });

    // Snack's save endpoint — anonymous, 24h TTL, no auth required.
    // Body shape from https://github.com/expo/snack docs.
    const snackDeps: Record<string, { version: string; isUserSpecified: true }> = {};
    for (const [pkg, ver] of Object.entries(dependencies)) {
      snackDeps[pkg] = { version: ver, isUserSpecified: true };
    }
    const body = {
      manifest: {
        name: (project.name || "Mobivable preview").slice(0, 40),
        description: "Mobivable preview — generated for on-device viewing.",
        sdkVersion: SNACK_SDK_VERSION,
        dependencies,
      },
      code,
      dependencies: snackDeps,
    };

    let saveRes: Response;
    try {
      saveRes = await fetch(SNACK_SAVE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Snack uses this header to attribute saves so they don't 429 us.
          "User-Agent": "Mobivable-Studio/1.0 (snack-preview)",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      return {
        ok: false as const,
        error: `Snack reach failed: ${e instanceof Error ? e.message : "network"}`,
      };
    }
    if (!saveRes.ok) {
      const text = await saveRes.text().catch(() => "");
      return {
        ok: false as const,
        error: `Snack save ${saveRes.status}: ${text.slice(0, 200)}`,
      };
    }
    const saveJson = (await saveRes.json().catch(() => null)) as {
      id?: string;
      hashId?: string;
    } | null;
    const hashId = saveJson?.hashId ?? saveJson?.id;
    if (!hashId) {
      return {
        ok: false as const,
        error: "Snack save returned no hashId.",
      };
    }

    // Embed URL — `platform=mydevice` shows the QR prominently and lets
    // the user switch ios/android/web inside the iframe. previewQRCode
    // surfaces the Expo Go pairing code without an extra round-trip.
    const embedUrl = `https://snack.expo.dev/embedded/${encodeURIComponent(
      hashId,
    )}?platform=mydevice&supportedPlatforms=ios,android,web&previewQRCode=true&theme=dark&waitForData=true`;
    // Direct device URL — opens the snack in Expo Go on the phone when
    // tapped from a mobile browser. Useful for share-link flows.
    const deviceUrl = `exp://exp.host/@snack/${encodeURIComponent(hashId)}`;

    return {
      ok: true as const,
      hashId,
      embedUrl,
      deviceUrl,
      sdkVersion: SNACK_SDK_VERSION,
    };
  });
