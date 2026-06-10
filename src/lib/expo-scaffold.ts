/**
 * Minimal Expo Router scaffold for the autonomous-agent build flow.
 *
 * When the Studio agent starts a real build (target_stack = "expo"), the
 * workspace manager seeds a fresh sandbox with these files so the agent has a
 * compiling, runnable Expo app to build ON — instead of writing every config
 * file from scratch. The agent then writes/edits screens, stores, and
 * components on top, and self-verifies with `bunx tsc --noEmit` + `bun run lint`.
 *
 * Keep this lean and tsc-clean: it is the floor, not the app. Expo SDK 53 /
 * expo-router 5, file-based routing under `app/`.
 */

export type FileMap = Record<string, string>;

/** Marker file the workspace manager checks to know a scaffold was applied. */
export const SCAFFOLD_MARKER = ".mobivable-scaffold";

// Bump on any scaffold change so the workspace manager rescaffolds existing
// sandboxes (the marker mismatch triggers a clean reseed + reinstall).
export const EXPO_SCAFFOLD_VERSION = "3";

/** Backend wiring injected into the scaffold (Supabase URL + anon/publishable key). */
export interface ScaffoldBackend {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

/**
 * Returns the scaffold file map for a project. `appName` only affects display
 * strings (app.json `name`/`slug`, the home heading) — the agent overwrites
 * the actual screens. `backend` wires the generated app to Supabase: a typed
 * client (`lib/supabase.ts`) is always included, and an `.env` with the
 * EXPO_PUBLIC_ credentials is added when they're provided so persistence/auth
 * work in the live preview.
 */
export function expoScaffold(appName: string, backend: ScaffoldBackend = {}): FileMap {
  const slug =
    (appName || "mobivable-app")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "mobivable-app";
  const display = appName?.trim() || "Mobivable App";

  return {
    [SCAFFOLD_MARKER]: `${EXPO_SCAFFOLD_VERSION}\n`,

    "package.json": JSON.stringify(
      {
        name: slug,
        main: "expo-router/entry",
        version: "1.0.0",
        scripts: {
          start: "expo start",
          android: "expo start --android",
          ios: "expo start --ios",
          web: "expo start --web",
          lint: "eslint .",
        },
        dependencies: {
          expo: "~53.0.0",
          "expo-router": "~5.0.0",
          "expo-status-bar": "~2.2.3",
          "expo-constants": "~17.1.0",
          "expo-linking": "~7.1.0",
          react: "19.0.0",
          "react-dom": "19.0.0",
          "react-native": "0.79.5",
          "react-native-safe-area-context": "5.4.0",
          "react-native-screens": "~4.10.0",
          "@expo/vector-icons": "~14.1.0",
          // Visual primitives so the build can REPRODUCE the mockup faithfully
          // (donut/line charts, gradient heros, styled QR) instead of flattening
          // it into plain cards. All are react-native-web / expo-export safe.
          // SDK 53-pinned versions.
          "react-native-svg": "15.11.2", // charts/icons/QR via SVG primitives
          "expo-linear-gradient": "~14.1.0", // gradient hero/card surfaces
          "react-native-qrcode-svg": "~6.3.2", // QR codes (uses react-native-svg)
          // Backend: every generated app is wired to Supabase (auth + Postgres).
          "@supabase/supabase-js": "^2.45.0",
          // Required for `expo export -p web` (the live preview build).
          "react-native-web": "~0.20.0",
          "@expo/metro-runtime": "~5.0.4",
        },
        devDependencies: {
          "@babel/core": "^7.25.0",
          "@types/react": "~19.0.10",
          eslint: "^9.0.0",
          "eslint-config-expo": "~9.2.0",
          typescript: "~5.8.3",
        },
        private: true,
      },
      null,
      2,
    ),

    "app.json": JSON.stringify(
      {
        expo: {
          name: display,
          slug,
          scheme: slug,
          version: "1.0.0",
          orientation: "portrait",
          userInterfaceStyle: "automatic",
          newArchEnabled: true,
          plugins: ["expo-router"],
          experiments: { typedRoutes: true },
        },
      },
      null,
      2,
    ),

    "tsconfig.json": JSON.stringify(
      {
        extends: "expo/tsconfig.base",
        compilerOptions: {
          strict: true,
          baseUrl: ".",
          paths: { "@/*": ["./*"] },
        },
        include: ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"],
      },
      null,
      2,
    ),

    "babel.config.js": `module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
`,

    ".eslintrc.js": `module.exports = {
  root: true,
  extends: ["expo"],
};
`,

    "expo-env.d.ts": `/// <reference types="expo/types" />
`,

    // ── Routing ──────────────────────────────────────────────────────
    "app/_layout.tsx": `import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
`,

    "app/(tabs)/_layout.tsx": `import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: "#6366F1" }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
`,

    "app/(tabs)/index.tsx": `import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>${display}</Text>
        <Text style={styles.subtitle}>Your app is being built…</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0A0A1A" },
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#9CA3AF", fontSize: 15, marginTop: 8 },
});
`,

    // ── Backend: Supabase client ─────────────────────────────────────
    // Every generated app is wired to Supabase. Credentials come from
    // EXPO_PUBLIC_ env vars (baked in at \`expo export\` time via the .env the
    // build injects). Import \`supabase\` for auth + Postgres; guard data calls
    // with \`isSupabaseConfigured\` so screens degrade gracefully if unset.
    "lib/supabase.ts": `import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when backend credentials are present (preview/runtime). */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
`,

    // EXPO_PUBLIC_ vars are read by \`expo export\`. Populated from the project's
    // backend at build time; empty placeholders when not injected.
    ".env": `EXPO_PUBLIC_SUPABASE_URL=${backend.supabaseUrl ?? ""}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${backend.supabaseAnonKey ?? ""}\n`,
  };
}
