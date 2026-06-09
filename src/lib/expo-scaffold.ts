/**
 * Minimal Expo Router scaffold for the autonomous-agent build flow.
 *
 * When the Studio agent starts a real build (target_stack = "expo"), the
 * workspace manager seeds a fresh sandbox with these files so the agent has a
 * compiling, runnable Expo app to build ON — instead of writing every config
 * file from scratch. The agent then writes/edits screens, stores, and
 * components on top, and self-verifies with `bunx tsc --noEmit` + `bun run lint`.
 *
 * Keep this lean and tsc-clean: it is the floor, not the app. Expo SDK 51 /
 * expo-router 3, file-based routing under `app/`.
 */

export type FileMap = Record<string, string>;

/** Marker file the workspace manager checks to know a scaffold was applied. */
export const SCAFFOLD_MARKER = ".mobivable-scaffold";

export const EXPO_SCAFFOLD_VERSION = "1";

/**
 * Returns the scaffold file map for a project. `appName` only affects display
 * strings (app.json `name`/`slug`, the home heading) — the agent overwrites
 * the actual screens.
 */
export function expoScaffold(appName: string): FileMap {
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
          expo: "~51.0.0",
          "expo-router": "~3.5.0",
          "expo-status-bar": "~1.12.0",
          "expo-constants": "~16.0.0",
          "expo-linking": "~6.3.0",
          react: "18.2.0",
          "react-dom": "18.2.0",
          "react-native": "0.74.5",
          "react-native-safe-area-context": "4.10.5",
          "react-native-screens": "3.31.1",
          "@expo/vector-icons": "^14.0.0",
          // Required for `expo export -p web` (the live preview build).
          "react-native-web": "~0.19.10",
          "@expo/metro-runtime": "~3.2.3",
        },
        devDependencies: {
          "@babel/core": "^7.24.0",
          "@types/react": "~18.2.79",
          eslint: "^8.57.0",
          "eslint-config-expo": "^7.1.0",
          typescript: "~5.3.3",
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
  };
}
