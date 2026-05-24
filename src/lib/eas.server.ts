/**
 * EAS Build helpers (server-only).
 * - GraphQL client against api.expo.dev
 * - Minimal hand-rolled USTAR tarball + gzip
 * - Expo project scaffold (mirrors export-expo with project-source minimum)
 * - Upload tarball to Supabase storage so EAS can fetch by URL
 */
import { gzipSync } from "node:zlib";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EAS_GRAPHQL_URL = "https://api.expo.dev/graphql";

export type EasError = { message: string; code?: string };

export async function easGraphql<T = any>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<{ data?: T; errors?: EasError[] }> {
  const token = process.env.EXPO_TOKEN;
  if (!token) {
    return { errors: [{ message: "EXPO_TOKEN secret is not configured on the server." }] };
  }
  const res = await fetch(EAS_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "expo-api-version": "2",
      "expo-client": "lovable-eas-bridge/0.1",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { errors: [{ message: `EAS HTTP ${res.status}: ${txt.slice(0, 400)}` }] };
  }
  return (await res.json()) as { data?: T; errors?: EasError[] };
}

// --------------------------------------------------------------------------
// USTAR tar builder (minimal)
// --------------------------------------------------------------------------
type FileEntry = { path: string; data: Uint8Array };

function strToUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function octal(n: number, width: number): string {
  return n.toString(8).padStart(width - 1, "0") + "\0";
}

function buildTarHeader(path: string, size: number, mtime: number): Uint8Array {
  // USTAR: max name 100 bytes; we keep paths short.
  const header = new Uint8Array(512);
  const writeStr = (s: string, off: number, len: number) => {
    const enc = strToUtf8(s);
    if (enc.length > len) throw new Error(`Path too long: ${s}`);
    header.set(enc, off);
  };
  writeStr(path, 0, 100);
  writeStr(octal(0o644, 8), 100, 8);
  writeStr(octal(0, 8), 108, 8);
  writeStr(octal(0, 8), 116, 8);
  writeStr(octal(size, 12), 124, 12);
  writeStr(octal(mtime, 12), 136, 12);
  // checksum field initially spaces
  for (let i = 148; i < 156; i++) header[i] = 0x20;
  header[156] = 0x30; // typeflag '0' = regular file
  writeStr("ustar\0", 257, 6);
  writeStr("00", 263, 2);
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i];
  const chk = sum.toString(8).padStart(6, "0") + "\0 ";
  header.set(strToUtf8(chk), 148);
  return header;
}

export function makeTarGz(files: FileEntry[]): Uint8Array {
  const mtime = Math.floor(Date.now() / 1000);
  const chunks: Uint8Array[] = [];
  for (const f of files) {
    chunks.push(buildTarHeader(f.path, f.data.length, mtime));
    chunks.push(f.data);
    const pad = (512 - (f.data.length % 512)) % 512;
    if (pad) chunks.push(new Uint8Array(pad));
  }
  // Two empty 512 blocks terminate the archive
  chunks.push(new Uint8Array(512));
  chunks.push(new Uint8Array(512));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const tar = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    tar.set(c, off);
    off += c.length;
  }
  return new Uint8Array(gzipSync(tar));
}

// --------------------------------------------------------------------------
// Expo project scaffold (lean — no router; one screen)
// --------------------------------------------------------------------------
export function scaffoldExpoProject(opts: {
  appName: string;
  slug: string;
  prompt: string;
  android: { package: string };
  ios: { bundleIdentifier: string };
}): FileEntry[] {
  const { appName, slug, prompt, android, ios } = opts;
  const safePrompt = (prompt || "Built with Lovable").replace(/[\r\n]+/g, " ").replace(/"/g, "'").slice(0, 240);

  const files: Record<string, string> = {
    "package.json": JSON.stringify(
      {
        name: slug,
        version: "1.0.0",
        main: "index.js",
        scripts: { start: "expo start", android: "expo start --android", ios: "expo start --ios" },
        dependencies: {
          expo: "~51.0.0",
          "expo-status-bar": "~1.12.0",
          react: "18.2.0",
          "react-native": "0.74.5",
        },
        devDependencies: { "@babel/core": "^7.20.0" },
        private: true,
      },
      null,
      2,
    ),
    "app.json": JSON.stringify(
      {
        expo: {
          name: appName,
          slug,
          version: "1.0.0",
          orientation: "portrait",
          icon: "./assets/icon.png",
          userInterfaceStyle: "automatic",
          splash: { image: "./assets/splash.png", resizeMode: "contain", backgroundColor: "#0a0a0f" },
          assetBundlePatterns: ["**/*"],
          ios: { supportsTablet: true, bundleIdentifier: ios.bundleIdentifier },
          android: { package: android.package, adaptiveIcon: { foregroundImage: "./assets/icon.png", backgroundColor: "#0a0a0f" } },
        },
      },
      null,
      2,
    ),
    "eas.json": JSON.stringify(
      {
        cli: { version: ">= 5.0.0" },
        build: {
          preview: { android: { buildType: "apk" }, distribution: "internal" },
          production: {},
        },
      },
      null,
      2,
    ),
    "babel.config.js": `module.exports = function (api) {\n  api.cache(true);\n  return { presets: ["babel-preset-expo"] };\n};\n`,
    "index.js": `import { registerRootComponent } from 'expo';\nimport App from './App';\nregisterRootComponent(App);\n`,
    "App.js": `import { StatusBar } from 'expo-status-bar';\nimport { StyleSheet, Text, View, ScrollView } from 'react-native';\n\nexport default function App() {\n  return (\n    <View style={styles.root}>\n      <StatusBar style="light" />\n      <ScrollView contentContainerStyle={styles.content}>\n        <Text style={styles.kicker}>${appName.toUpperCase().replace(/[^A-Z0-9 ]/g, "")}</Text>\n        <Text style={styles.h1}>${appName.replace(/[<>]/g, "")}</Text>\n        <Text style={styles.body}>${safePrompt}</Text>\n      </ScrollView>\n    </View>\n  );\n}\n\nconst styles = StyleSheet.create({\n  root: { flex: 1, backgroundColor: '#0a0a0f' },\n  content: { padding: 32, paddingTop: 96, gap: 16 },\n  kicker: { color: '#6366f1', fontSize: 11, letterSpacing: 3, fontWeight: '700' },\n  h1: { color: '#fff', fontSize: 36, fontWeight: '800' },\n  body: { color: '#9ca3af', fontSize: 16, lineHeight: 24 },\n});\n`,
    ".gitignore": "node_modules/\n.expo/\ndist/\n*.log\n",
  };

  // 1x1 transparent PNG for icon + splash so app.json paths resolve
  const tinyPng = new Uint8Array([
    0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
    0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1f,0x15,0xc4,
    0x89,0x00,0x00,0x00,0x0d,0x49,0x44,0x41,0x54,0x78,0x9c,0x63,0x00,0x01,0x00,0x00,
    0x05,0x00,0x01,0x0d,0x0a,0x2d,0xb4,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,
    0x42,0x60,0x82,
  ]);

  const entries: FileEntry[] = [];
  for (const [p, content] of Object.entries(files)) entries.push({ path: p, data: strToUtf8(content) });
  entries.push({ path: "assets/icon.png", data: tinyPng });
  entries.push({ path: "assets/splash.png", data: tinyPng });
  return entries;
}

// --------------------------------------------------------------------------
// Storage: upload the tarball so EAS can fetch by URL.
// --------------------------------------------------------------------------
export async function uploadProjectArchive(
  userId: string,
  projectId: string,
  bytes: Uint8Array,
): Promise<{ url: string; path: string } | { error: string }> {
  const path = `eas-sources/${userId}/${projectId}/${Date.now()}.tar.gz`;
  const { error } = await supabaseAdmin.storage
    .from("project-attachments")
    .upload(path, bytes, { contentType: "application/gzip", upsert: true });
  if (error) return { error: error.message };
  const { data } = supabaseAdmin.storage.from("project-attachments").getPublicUrl(path);
  return { url: data.publicUrl, path };
}
