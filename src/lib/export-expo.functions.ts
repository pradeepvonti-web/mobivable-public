import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import JSZip from "jszip";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AGENTS, type AgentRole } from "./agents";
import {
  MONETIZATION_ENV_KEYS,
  MONETIZATION_NPM_DEP,
  admobExpoPlugin,
  generateMonetizationLib,
} from "./export-project";
import {
  emitForCapabilities,
  type NativeCapabilityRow,
} from "./native-capabilities";

function slug(s: string): string {
  return (s || "my-app")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "my-app";
}

function pascal(s: string): string {
  return (s || "App")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("") || "App";
}

/** Export a full, runnable Expo project (zip) from the project + agent outputs. */
export const exportExpoProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: project } = await supabase
      .from("projects")
      .select("id, name, prompt, agents_md, user_id, result")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project || project.user_id !== userId)
      return { ok: false as const, error: "Project not found" };

    // ─── Native capabilities ───
    // Read the jsonb array, ask the catalog what to emit. Loose cast
    // because the column is brand-new and the generated types don't
    // know it yet.
    const sbLoose = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: capRow } = (await sbLoose
      .from("projects")
      .select("native_capabilities")
      .eq("id", data.projectId)
      .maybeSingle()) as {
      data: { native_capabilities: NativeCapabilityRow[] | null } | null;
    };
    const capabilityRows = (capRow?.native_capabilities ?? []) as NativeCapabilityRow[];
    const capabilityEmission = emitForCapabilities(capabilityRows);

    // ─── Monetization config (from project_env_vars) ───
    // The MonetizationPanel persists provider + provider-specific public keys
    // here. We pull only the ENV keys an export can safely bundle into a React
    // Native binary (sensitive things like stripe_webhook_secret are stored
    // server-side via `visible: false` and are deliberately NOT in this list).
    const { data: envRows } = await supabase
      .from("project_env_vars")
      .select("name, value")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .in("name", MONETIZATION_ENV_KEYS as readonly string[] as string[]);
    const envMap: Record<string, string> = {};
    for (const row of envRows ?? []) {
      if (row?.name && typeof row.value === "string") envMap[row.name] = row.value;
    }
    const monetizationProvider = envMap.monetization_provider || "";
    const monetizationDep = monetizationProvider
      ? MONETIZATION_NPM_DEP[monetizationProvider]
      : undefined;
    const hasMonetization = !!monetizationProvider && !!monetizationDep;

    // Latest agent run + tasks for context
    const { data: runs } = await supabase
      .from("agent_runs")
      .select("id, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(1);
    const runId = runs?.[0]?.id;
    const { data: tasks } = runId
      ? await supabase
          .from("agent_tasks")
          .select("role, output, status")
          .eq("run_id", runId)
          .order("ordinal", { ascending: true })
      : { data: [] as Array<{ role: string; output: string | null; status: string }> };

    const completed = (tasks ?? []).filter((t) => t.status === "completed" && t.output);
    const findOutput = (role: AgentRole) =>
      completed.find((t) => t.role === role)?.output ?? "";

    const appName = project.name || "My App";
    const pkgSlug = slug(appName);
    const pkgPascal = pascal(appName);

    // Try to read a theme color from the designer output (very rough heuristic)
    const designerOut = findOutput("ui_ux_designer");
    const hexMatches = designerOut.match(/#[0-9a-fA-F]{6}/g) ?? [];
    const primary = hexMatches[2] || hexMatches[0] || "#6366f1";
    const bg = hexMatches[0] || "#0a0a0f";
    const card = hexMatches[1] || "#161623";
    const text = hexMatches[4] || "#ffffff";
    const muted = hexMatches[5] || "#9ca3af";

    const zip = new JSZip();

    const dependencies: Record<string, string> = {
      expo: "~51.0.0",
      "expo-router": "~3.5.0",
      "expo-status-bar": "~1.12.0",
      "expo-constants": "~16.0.0",
      "expo-linking": "~6.3.0",
      react: "18.2.0",
      "react-native": "0.74.5",
      "react-native-safe-area-context": "4.10.5",
      "react-native-screens": "3.31.1",
      "react-native-gesture-handler": "~2.16.1",
      "@react-navigation/native": "^6.0.2",
    };
    if (hasMonetization && monetizationDep) {
      dependencies[monetizationDep.pkg] = monetizationDep.version;
    }
    // Native-capabilities catalog adds whatever each opted-in capability
    // declares (expo-notifications, stripe-react-native, etc.).
    Object.assign(dependencies, capabilityEmission.dependencies);

    // package.json — pinned to current Expo SDK 51 baseline
    zip.file(
      "package.json",
      JSON.stringify(
        {
          name: pkgSlug,
          version: "1.0.0",
          main: "expo-router/entry",
          scripts: {
            start: "expo start",
            android: "expo start --android",
            ios: "expo start --ios",
            web: "expo start --web",
          },
          dependencies,
          devDependencies: {
            "@babel/core": "^7.20.0",
            typescript: "~5.3.3",
            "@types/react": "~18.2.45",
          },
          private: true,
        },
        null,
        2,
      ),
    );

    // app.json — append the AdMob config plugin when admob is the active
    // provider. The Google Mobile Ads SDK needs the *app* IDs at prebuild
    // time (not just at runtime) to wire the iOS Info.plist and the
    // Android manifest, otherwise the SDK boot crashes on a real device.
    const appJsonPlugins: unknown[] = ["expo-router"];
    if (monetizationProvider === "admob") {
      const plugin = admobExpoPlugin(envMap);
      if (plugin) appJsonPlugins.push(plugin);
    }
    // Plugins from the native-capabilities catalog are appended in row
    // order. Each is a `[name, options]` tuple per Expo config-plugin spec.
    for (const plugin of capabilityEmission.expoPlugins) {
      appJsonPlugins.push(plugin);
    }

    const iosBlock: Record<string, unknown> = { supportsTablet: true };
    if (Object.keys(capabilityEmission.iosInfoPlist).length > 0) {
      iosBlock.infoPlist = capabilityEmission.iosInfoPlist;
    }
    const androidBlock: Record<string, unknown> = {
      adaptiveIcon: { backgroundColor: bg },
    };
    if (capabilityEmission.androidPermissions.length > 0) {
      androidBlock.permissions = capabilityEmission.androidPermissions;
    }

    zip.file(
      "app.json",
      JSON.stringify(
        {
          expo: {
            name: appName,
            slug: pkgSlug,
            version: "1.0.0",
            orientation: "portrait",
            userInterfaceStyle: "automatic",
            scheme: pkgSlug,
            ios: iosBlock,
            android: androidBlock,
            web: { bundler: "metro" },
            plugins: appJsonPlugins,
          },
        },
        null,
        2,
      ),
    );

    zip.file(
      "babel.config.js",
      `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
`,
    );

    zip.file(
      "tsconfig.json",
      JSON.stringify(
        {
          extends: "expo/tsconfig.base",
          compilerOptions: { strict: true },
        },
        null,
        2,
      ),
    );

    zip.file(
      ".gitignore",
      `node_modules/
.expo/
dist/
*.log
.env
.env.*
ios/
android/
`,
    );

    // theme
    zip.file(
      "theme.ts",
      `export const theme = {
  colors: {
    background: ${JSON.stringify(bg)},
    card: ${JSON.stringify(card)},
    primary: ${JSON.stringify(primary)},
    text: ${JSON.stringify(text)},
    muted: ${JSON.stringify(muted)},
    border: "rgba(255,255,255,0.08)",
  },
  radius: { sm: 8, md: 12, lg: 16, xl: 24 },
  spacing: (n: number) => n * 4,
};
`,
    );

    // lib/monetization.ts — only emitted if a provider was configured in the
    // MonetizationPanel. Reuses the same generator as the full project export
    // so the two export paths can't drift apart.
    if (hasMonetization) {
      zip.file(
        "lib/monetization.ts",
        generateMonetizationLib(monetizationProvider, envMap),
      );
    }

    // expo-router root. When monetization is configured, fire-and-forget
    // initMonetization() on mount so the provider SDK is ready by first
    // paywall/checkPremium call.
    const monetizationImport = hasMonetization
      ? `\nimport { useEffect } from "react";\nimport { initMonetization } from "../lib/monetization";`
      : "";
    const monetizationEffect = hasMonetization
      ? `\n  useEffect(() => { initMonetization().catch((e) => console.warn("[monetization] init failed:", e)); }, []);\n`
      : "";
    zip.file(
      "app/_layout.tsx",
      `import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { theme } from "../theme";${monetizationImport}

export default function RootLayout() {${monetizationEffect}
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      />
    </>
  );
}
`,
    );

    zip.file(
      "app/index.tsx",
      `import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Link } from "expo-router";
import { theme } from "../theme";

export default function Home() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>${appName.toUpperCase()}</Text>
      <Text style={styles.h1}>Welcome to ${pkgPascal}</Text>
      <Text style={styles.lead}>
        ${(project.prompt || "Your mobile app, generated by the Lovable agent team.").replace(/[\r\n]+/g, " ").replace(/"/g, '\\"').slice(0, 240)}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Get started</Text>
        <Text style={styles.cardBody}>Run \`npm install\` then \`npx expo start\`. Edit \`app/index.tsx\` to start building.</Text>
        <Link href="/about" asChild>
          <Pressable style={styles.btn}>
            <Text style={styles.btnText}>Go to About →</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 24, gap: 16 },
  kicker: { color: theme.colors.primary, fontSize: 11, letterSpacing: 3, fontWeight: "600" },
  h1: { color: theme.colors.text, fontSize: 32, fontWeight: "800" },
  lead: { color: theme.colors.muted, fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
    marginTop: 12,
  },
  cardTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "700" },
  cardBody: { color: theme.colors.muted, fontSize: 14, lineHeight: 20 },
  btn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    alignSelf: "flex-start",
  },
  btnText: { color: "#fff", fontWeight: "700" },
});
`,
    );

    zip.file(
      "app/about.tsx",
      `import { View, Text, StyleSheet, ScrollView } from "react-native";
import { theme } from "../theme";

export default function About() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>About ${pkgPascal}</Text>
      <Text style={styles.body}>
        This Expo project was generated by the Lovable agent team. See \`Agents.md\` for the full
        build playbook every contributor (human or AI) should follow.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 24, gap: 12 },
  h1: { color: theme.colors.text, fontSize: 28, fontWeight: "800" },
  body: { color: theme.colors.muted, fontSize: 15, lineHeight: 22 },
});
`,
    );

    // Agents.md
    zip.file(
      "Agents.md",
      project.agents_md ||
        `# Agents.md\n\nProject: ${appName}\n\n${project.prompt || ""}\n\n(No tailored Agents.md was generated yet — open the project in Lovable and click "Agents.md → Regenerate".)\n`,
    );

    // README with the team's outputs baked in
    const teamSection = completed
      .map(
        (t) =>
          `### ${AGENTS[t.role as AgentRole]?.name ?? t.role}\n\n${t.output ?? ""}`,
      )
      .join("\n\n---\n\n");

    zip.file(
      "README.md",
      `# ${appName}\n\n${project.prompt || ""}\n\n## Quickstart\n\n\`\`\`bash\nnpm install\nnpx expo start\n\`\`\`\n\nOpen on iOS Simulator, Android Emulator, or scan the QR code with the Expo Go app.\n\n## Project structure\n\n- \`app/_layout.tsx\` — root Stack navigator (expo-router)\n- \`app/index.tsx\` — Home screen\n- \`app/about.tsx\` — About screen\n- \`theme.ts\` — shared colors / spacing tokens\n- \`Agents.md\` — playbook every contributor follows\n\n## Theme\n\n- Background \`${bg}\`\n- Card \`${card}\`\n- Primary \`${primary}\`\n- Text \`${text}\`\n\n## Build team notes\n\n${teamSection || "_No agent outputs yet._"}\n`,
    );

    // Generate zip
    const bytes = await zip.generateAsync({ type: "uint8array" });

    // Upload to storage using admin client (bypass RLS, scope path to user)
    const path = `expo-exports/${userId}/${data.projectId}/${pkgSlug}-${Date.now()}.zip`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("project-attachments")
      .upload(path, bytes, {
        contentType: "application/zip",
        upsert: true,
      });
    if (upErr) return { ok: false as const, error: upErr.message };

    const { data: pub } = supabaseAdmin.storage
      .from("project-attachments")
      .getPublicUrl(path);

    return {
      ok: true as const,
      url: pub.publicUrl,
      filename: `${pkgSlug}.zip`,
      bytes: bytes.length,
    };
  });
