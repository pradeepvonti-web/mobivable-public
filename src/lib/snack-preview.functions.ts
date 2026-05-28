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

const SNACK_SAVE_URL = "https://exp.host/--/api/v2/snack/save";
const SNACK_SDK_VERSION = "51.0.0";

interface ParsedSchemaForSnack {
  primary: string;
  background: string;
  card: string;
  text: string;
  muted: string;
  firstScreenTitle: string;
  /** Up to 6 short labels we pull from the first screen's elements so the
   *  on-device preview isn't an empty page. */
  bullets: string[];
}

function extractForSnack(
  prompt: string,
  schemaRaw: string | null,
): ParsedSchemaForSnack {
  const schema = parseAppSchema(schemaRaw ?? "");
  const firstScreen = schema?.screens?.[0];
  const bullets: string[] = [];
  if (firstScreen && Array.isArray(firstScreen.elements)) {
    for (const el of firstScreen.elements as Array<{ text?: string; label?: string; title?: string }>) {
      const t = (el.text ?? el.label ?? el.title ?? "").toString().trim();
      if (t && t.length <= 60) bullets.push(t);
      if (bullets.length >= 6) break;
    }
  }
  if (bullets.length === 0 && prompt) {
    // Fall back to a one-liner from the seed prompt so the screen isn't blank.
    bullets.push(prompt.replace(/\s+/g, " ").trim().slice(0, 80));
  }

  // Theme heuristics — same approach exportExpoProject uses to lift colors
  // out of the designer agent's markdown. Keeps the two surfaces in sync.
  const hexFromPrompt = (prompt + " " + (schemaRaw ?? "")).match(/#[0-9a-fA-F]{6}/g) ?? [];
  return {
    primary: hexFromPrompt[2] || hexFromPrompt[0] || "#6366f1",
    background: hexFromPrompt[0] || "#0a0a0f",
    card: hexFromPrompt[1] || "#161623",
    text: hexFromPrompt[4] || "#ffffff",
    muted: hexFromPrompt[5] || "#9ca3af",
    firstScreenTitle: firstScreen?.title?.toString().slice(0, 40) || "Home",
    bullets,
  };
}

function buildSnackFiles(args: {
  name: string;
  prompt: string;
  schema: ParsedSchemaForSnack;
}): Record<string, { contents: string; type: "CODE" }> {
  const { name, prompt, schema } = args;
  // App.tsx — single screen renderer. Intentionally narrow scope: theme
  // colors, first-screen title, element bullet list. A future iteration
  // will compile the full MobileAppSchema into RN components.
  const appTsx = `import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const theme = {
  background: ${JSON.stringify(schema.background)},
  card: ${JSON.stringify(schema.card)},
  primary: ${JSON.stringify(schema.primary)},
  text: ${JSON.stringify(schema.text)},
  muted: ${JSON.stringify(schema.muted)},
};

const bullets = ${JSON.stringify(schema.bullets)};

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.kicker}>${name.replace(/[<>"&]/g, "").slice(0, 40).toUpperCase()}</Text>
          <Text style={styles.h1}>${schema.firstScreenTitle.replace(/[<>"&]/g, "")}</Text>
          <Text style={styles.lead}>
            ${prompt.replace(/[<>"&]/g, "").replace(/\s+/g, " ").trim().slice(0, 200)}
          </Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Preview on your phone</Text>
            <Text style={styles.cardBody}>
              This is the project's current theme rendered on a real React
              Native runtime. Scan the QR with Expo Go to feel it on your own
              device.
            </Text>
          </View>
          {bullets.map((b, i) => (
            <View key={i} style={styles.bullet}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{b}</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.background },
  content: { padding: 24, gap: 16 },
  kicker: { color: theme.primary, fontSize: 11, letterSpacing: 3, fontWeight: "600" },
  h1: { color: theme.text, fontSize: 30, fontWeight: "800" },
  lead: { color: theme.muted, fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 18,
    gap: 8,
    marginTop: 12,
  },
  cardTitle: { color: theme.text, fontSize: 18, fontWeight: "700" },
  cardBody: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  bullet: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  bulletDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: theme.primary },
  bulletText: { color: theme.text, fontSize: 15, flex: 1 },
});
`;

  return {
    "App.tsx": { contents: appTsx, type: "CODE" },
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
    const code = buildSnackFiles({
      name: project.name || "Mobivable App",
      prompt: project.prompt ?? "",
      schema,
    });

    // Snack's save endpoint — anonymous, 24h TTL, no auth required.
    // Body shape from https://github.com/expo/snack docs.
    const body = {
      manifest: {
        name: (project.name || "Mobivable preview").slice(0, 40),
        description: "Mobivable preview — generated for on-device viewing.",
        sdkVersion: SNACK_SDK_VERSION,
        dependencies: {
          "react-native-safe-area-context": "4.10.5",
        },
      },
      code,
      dependencies: {
        "react-native-safe-area-context": {
          version: "4.10.5",
          isUserSpecified: true,
        },
      },
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
