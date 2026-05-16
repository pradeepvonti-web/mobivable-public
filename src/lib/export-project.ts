/**
 * Converts a MobileAppSchema into a downloadable Expo/React Native project.
 * Generates all the files needed for a working Expo app.
 */
import type { MobileAppSchema, MElement, MScreen } from "./mobile-app-schema";

// ─── Icon mapping: Lucide → Expo vector icons ──────────────────
const EXPO_ICON_MAP: Record<string, string> = {
  home: "home", search: "search", user: "person", settings: "settings",
  bell: "notifications", heart: "favorite", star: "star", plus: "add",
  minus: "remove", check: "check", x: "close", "chevron-right": "chevron-right",
  "chevron-left": "chevron-left", "arrow-up": "arrow-upward",
  "arrow-down": "arrow-downward", calendar: "calendar-today", clock: "schedule",
  "map-pin": "place", camera: "camera-alt", image: "image", play: "play-arrow",
  pause: "pause", "shopping-cart": "shopping-cart", "shopping-bag": "shopping-bag",
  "credit-card": "credit-card", "dollar-sign": "attach-money",
  "trending-up": "trending-up", "trending-down": "trending-down",
  "bar-chart": "bar-chart", "pie-chart": "pie-chart", activity: "show-chart",
  trophy: "emoji-events", target: "gps-fixed", flame: "local-fire-department",
  zap: "flash-on", coffee: "coffee", edit: "edit", trash: "delete",
  lock: "lock", globe: "language", mail: "mail", phone: "phone",
  share: "share", bookmark: "bookmark", gift: "card-giftcard",
  tag: "label", package: "inventory", truck: "local-shipping",
  footprints: "directions-walk", dumbbell: "fitness-center", bike: "directions-bike",
  waves: "waves", leaf: "eco", sparkles: "auto-awesome",
};

function expoIcon(name: string): string {
  return EXPO_ICON_MAP[name] ?? "circle";
}

// ─── Theme → RN StyleSheet colors ──────────────────────────────
function themeToRNColors(theme: string | object): Record<string, string> {
  const defaults: Record<string, Record<string, string>> = {
    dark_fitness: { bg: "#0a0a1a", card: "#1a1a2e", primary: "#6366f1", accent: "#22c55e", text: "#f8fafc", muted: "#64748b", border: "#27272a", danger: "#ef4444", success: "#22c55e" },
    dark_social: { bg: "#0f0f1a", card: "#1a1a2e", primary: "#ec4899", accent: "#8b5cf6", text: "#f8fafc", muted: "#64748b", border: "#27272a", danger: "#ef4444", success: "#22c55e" },
    dark_finance: { bg: "#0a0f1a", card: "#111827", primary: "#10b981", accent: "#6366f1", text: "#f8fafc", muted: "#64748b", border: "#1f2937", danger: "#ef4444", success: "#10b981" },
    dark_ecommerce: { bg: "#0a0a0a", card: "#171717", primary: "#f59e0b", accent: "#ec4899", text: "#f8fafc", muted: "#737373", border: "#262626", danger: "#ef4444", success: "#22c55e" },
    light_clean: { bg: "#ffffff", card: "#f8fafc", primary: "#2563eb", accent: "#7c3aed", text: "#0f172a", muted: "#64748b", border: "#e2e8f0", danger: "#ef4444", success: "#22c55e" },
    light_health: { bg: "#fafdf7", card: "#ffffff", primary: "#16a34a", accent: "#0ea5e9", text: "#0f172a", muted: "#64748b", border: "#e5e7eb", danger: "#ef4444", success: "#16a34a" },
  };
  if (typeof theme === "string") return defaults[theme] ?? defaults.dark_fitness;
  return defaults.dark_fitness;
}

// ─── Element → React Native JSX string ─────────────────────────
function elementToRN(el: MElement, indent = 4): string {
  const pad = " ".repeat(indent);
  switch (el.type) {
    case "greeting":
      return `${pad}<View style={{ paddingVertical: 8 }}>\n${pad}  <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>Hello, ${el.props.name}!</Text>\n${pad}  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>${el.props.subtitle ?? "Let's get started"}</Text>\n${pad}</View>`;
    case "text":
      return `${pad}<Text style={{ fontSize: ${el.props.size === "2xl" ? 28 : el.props.size === "xl" ? 22 : el.props.size === "lg" ? 18 : el.props.size === "sm" ? 12 : el.props.size === "xs" ? 10 : 14}, fontWeight: '${el.props.weight === "bold" ? "700" : el.props.weight === "semibold" ? "600" : "400"}', color: colors.${el.props.color === "primary" ? "primary" : el.props.color === "muted" ? "muted" : el.props.color === "success" ? "success" : "text"}${el.props.align ? `, textAlign: '${el.props.align}'` : ""} }}>${el.props.content}</Text>`;
    case "button":
      return `${pad}<TouchableOpacity style={{ backgroundColor: ${el.props.variant === "outline" ? "'transparent'" : "colors.primary"}, padding: 14, borderRadius: 14, alignItems: 'center'${el.props.variant === "outline" ? ", borderWidth: 1, borderColor: colors.primary" : ""} }}>\n${pad}  <Text style={{ color: ${el.props.variant === "outline" ? "colors.primary" : "'#fff'"}, fontSize: 14, fontWeight: '600' }}>${el.props.label}</Text>\n${pad}</TouchableOpacity>`;
    case "card":
      return `${pad}<View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}>\n${el.props.title ? `${pad}  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 }}>${el.props.title}</Text>\n` : ""}${(el.props.children ?? []).map(c => elementToRN(c, indent + 2)).join("\n")}\n${pad}</View>`;
    case "divider":
      return `${pad}<View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />`;
    case "spacer":
      return `${pad}<View style={{ height: ${el.props?.height ?? 16} }} />`;
    case "header":
      return `${pad}<View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>\n${pad}  <View style={{ flex: 1 }}>\n${pad}    <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>${el.props.title}</Text>\n${el.props.subtitle ? `${pad}    <Text style={{ fontSize: 11, color: colors.muted }}>${el.props.subtitle}</Text>\n` : ""}${pad}  </View>\n${pad}</View>`;
    case "search-bar":
      return `${pad}<View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border }}>\n${pad}  <MaterialIcons name="search" size={16} color={colors.muted} />\n${pad}  <Text style={{ marginLeft: 8, fontSize: 13, color: colors.muted }}>${el.props.placeholder ?? "Search..."}</Text>\n${pad}</View>`;
    case "list":
      return (el.props.items ?? []).map(item =>
        `${pad}<View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: colors.card, borderRadius: 10, marginBottom: 4, borderWidth: 1, borderColor: colors.border }}>\n${item.icon ? `${pad}  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>\n${pad}    <MaterialIcons name="${expoIcon(item.icon)}" size={14} color={colors.primary} />\n${pad}  </View>\n` : ""}${pad}  <View style={{ flex: 1, marginLeft: 12 }}>\n${pad}    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text }}>${item.title}</Text>\n${item.subtitle ? `${pad}    <Text style={{ fontSize: 10, color: colors.muted }}>${item.subtitle}</Text>\n` : ""}${pad}  </View>\n${item.trailing ? `${pad}  <Text style={{ fontSize: 12, color: colors.muted }}>${item.trailing}</Text>\n` : ""}${pad}</View>`
      ).join("\n");
    case "stat-row":
      return `${pad}<View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 }}>\n${(el.props.stats ?? []).map(s =>
        `${pad}  <View style={{ alignItems: 'center' }}>\n${pad}    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '${s.color ?? "#6366f1"}22', alignItems: 'center', justifyContent: 'center' }}>\n${pad}      <MaterialIcons name="${expoIcon(s.icon)}" size={16} color="${s.color ?? "#6366f1"}" />\n${pad}    </View>\n${pad}    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 6 }}>${s.value}</Text>\n${pad}    <Text style={{ fontSize: 9, color: colors.muted }}>${s.label}</Text>\n${pad}  </View>`
      ).join("\n")}\n${pad}</View>`;
    case "hero-banner":
      return `${pad}<View style={{ height: ${el.props.height ?? 160}, borderRadius: 16, padding: 20, justifyContent: 'flex-end', overflow: 'hidden' }}>\n${pad}  <LinearGradient colors={['${el.props.gradient?.includes("#") ? el.props.gradient.match(/#[0-9a-fA-F]{6}/g)?.[0] ?? "#6366f1" : "#6366f1"}', '${el.props.gradient?.includes("#") ? el.props.gradient.match(/#[0-9a-fA-F]{6}/g)?.[1] ?? "#4f46e5" : "#4f46e5"}']} style={StyleSheet.absoluteFillObject} />\n${pad}  <Text style={{ fontSize: 20, fontWeight: '700', color: '#fff' }}>${el.props.title}</Text>\n${el.props.subtitle ? `${pad}  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>${el.props.subtitle}</Text>\n` : ""}${pad}</View>`;
    case "notification":
      return `${pad}<View style={{ flexDirection: 'row', padding: 12, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.${el.props.type === "success" ? "success" : el.props.type === "error" ? "danger" : "primary"} }}>\n${pad}  <View style={{ flex: 1 }}>\n${pad}    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>${el.props.title}</Text>\n${pad}    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>${el.props.message}</Text>\n${pad}  </View>\n${pad}</View>`;
    case "rating":
      return `${pad}<View style={{ flexDirection: 'row', alignItems: 'center' }}>\n${Array.from({ length: el.props.max ?? 5 }, (_, i) => `${pad}  <Text style={{ fontSize: 18, color: ${i < Math.round(el.props.value) ? "'#f59e0b'" : "colors.border"} }}>★</Text>`).join("\n")}\n${el.props.label ? `${pad}  <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}>${el.props.label}</Text>\n` : ""}${pad}</View>`;
    case "grid-cards":
      return `${pad}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>\n${(el.props.items ?? []).map(item => `${pad}  <View style={{ width: '${el.props.columns === 3 ? "30" : "48"}%', backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}>\n${item.icon ? `${pad}    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '${item.color ?? "#6366f1"}18', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>\n${pad}      <MaterialIcons name="${expoIcon(item.icon)}" size={16} color="${item.color ?? "#6366f1"}" />\n${pad}    </View>\n` : ""}${pad}    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>${item.title}</Text>\n${item.subtitle ? `${pad}    <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>${item.subtitle}</Text>\n` : ""}${pad}  </View>`).join("\n")}\n${pad}</View>`;
    default:
      return `${pad}{/* ${el.type} */}`;
  }
}

// ─── Screen → RN Component ─────────────────────────────────────
function screenToComponent(screen: MScreen, isDefault = false): string {
  const name = screen.id.charAt(0).toUpperCase() + screen.id.slice(1).replace(/[^a-zA-Z0-9]/g, "") + "Screen";
  const elements = screen.elements.map(el => elementToRN(el, 6)).join("\n\n");

  return `function ${name}() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
${elements}
    </ScrollView>
  );
}`;
}

// ─── Generate full App.tsx ──────────────────────────────────────
function generateAppTsx(schema: MobileAppSchema): string {
  const colors = themeToRNColors(schema.theme);
  const screens = schema.screens.map((s, i) => screenToComponent(s, i === 0));
  const navItems = schema.navigation?.items ?? schema.screens.slice(0, 5).map(s => ({ screen: s.id, label: s.title, icon: s.icon }));

  return `import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';

// ─── Theme colors ───────────────────────────────────────────
const colors = ${JSON.stringify(colors, null, 2)};

// ─── Screens ────────────────────────────────────────────────
${screens.join("\n\n")}

// ─── Navigation ─────────────────────────────────────────────
const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <>
      <StatusBar style="${colors.bg.startsWith("#0") || colors.bg.startsWith("#1") ? "light" : "dark"}" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: colors.bg,
              borderTopColor: colors.border,
              height: 56,
            },
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.muted,
            tabBarLabelStyle: { fontSize: 10 },
          }}
        >
${navItems.map(item => {
    const screenName = item.screen.charAt(0).toUpperCase() + item.screen.slice(1).replace(/[^a-zA-Z0-9]/g, "") + "Screen";
    return `          <Tab.Screen
            name="${item.label}"
            component={${screenName}}
            options={{
              tabBarIcon: ({ color, size }) => (
                <MaterialIcons name="${expoIcon(item.icon)}" size={size} color={color} />
              ),
            }}
          />`;
  }).join("\n")}
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}
`;
}

// ─── Generate package.json ──────────────────────────────────────
function generatePackageJson(schema: MobileAppSchema): string {
  const name = schema.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  return JSON.stringify({
    name,
    version: "1.0.0",
    main: "node_modules/expo/AppEntry.js",
    scripts: {
      start: "expo start",
      android: "expo start --android",
      ios: "expo start --ios",
      web: "expo start --web",
    },
    dependencies: {
      "expo": "~51.0.0",
      "expo-status-bar": "~1.12.1",
      "expo-linear-gradient": "~13.0.2",
      "react": "18.2.0",
      "react-native": "0.74.5",
      "@react-navigation/native": "^6.1.18",
      "@react-navigation/bottom-tabs": "^6.6.1",
      "react-native-screens": "~3.31.1",
      "react-native-safe-area-context": "4.10.5",
      "@expo/vector-icons": "^14.0.2",
    },
    devDependencies: {
      "@babel/core": "^7.20.0",
      "@types/react": "~18.2.45",
      "typescript": "~5.3.3",
    },
    private: true,
  }, null, 2);
}

// ─── Generate app.json ──────────────────────────────────────────
function generateAppJson(schema: MobileAppSchema): string {
  const slug = schema.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  return JSON.stringify({
    expo: {
      name: schema.name,
      slug,
      version: "1.0.0",
      orientation: "portrait",
      userInterfaceStyle: "automatic",
      splash: {
        backgroundColor: typeof schema.theme === "string" && schema.theme.startsWith("dark") ? "#0a0a1a" : "#ffffff",
      },
      ios: { supportsTablet: true },
      android: { adaptiveIcon: { backgroundColor: "#ffffff" } },
      web: { bundler: "metro" },
    },
  }, null, 2);
}

// ─── Generate tsconfig.json ─────────────────────────────────────
function generateTsConfig(): string {
  return JSON.stringify({
    extends: "expo/tsconfig.base",
    compilerOptions: {
      strict: true,
    },
  }, null, 2);
}

// ─── Public API ─────────────────────────────────────────────────
export type ExportedFile = { path: string; content: string };

/** Convert a MobileAppSchema into a complete set of Expo project files. */
export function exportToExpo(schema: MobileAppSchema): ExportedFile[] {
  return [
    { path: "App.tsx", content: generateAppTsx(schema) },
    { path: "package.json", content: generatePackageJson(schema) },
    { path: "app.json", content: generateAppJson(schema) },
    { path: "tsconfig.json", content: generateTsConfig() },
    { path: "babel.config.js", content: `module.exports = function(api) {\n  api.cache(true);\n  return { presets: ['babel-preset-expo'] };\n};\n` },
    { path: "README.md", content: `# ${schema.name}\n\nGenerated by **Mobivable AI App Studio**.\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpx expo start\n\`\`\`\n\nScan the QR code with the **Expo Go** app on your phone.\n` },
  ];
}

/** Create a downloadable ZIP blob from exported files. */
export async function createExportZip(schema: MobileAppSchema): Promise<Blob> {
  const files = exportToExpo(schema);

  // Simple ZIP using the JSZip-compatible approach
  // We'll create a basic uncompressed ZIP manually
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const contentBytes = encoder.encode(file.content);
    const crc = crc32(contentBytes);

    // Local file header
    const header = new Uint8Array(30 + nameBytes.length);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x04034b50, true); // signature
    hv.setUint16(4, 20, true); // version
    hv.setUint16(6, 0, true); // flags
    hv.setUint16(8, 0, true); // compression (none)
    hv.setUint16(10, 0, true); // mod time
    hv.setUint16(12, 0, true); // mod date
    hv.setUint32(14, crc, true); // crc32
    hv.setUint32(18, contentBytes.length, true); // compressed size
    hv.setUint32(22, contentBytes.length, true); // uncompressed size
    hv.setUint16(26, nameBytes.length, true); // filename length
    hv.setUint16(28, 0, true); // extra field length
    header.set(nameBytes, 30);

    // Central directory entry
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, contentBytes.length, true);
    cv.setUint32(24, contentBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0x20, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);

    parts.push(header, contentBytes);
    centralDir.push(cd);
    offset += header.length + contentBytes.length;
  }

  // End of central directory
  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) {
    parts.push(cd);
    cdSize += cd.length;
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, centralDir.length, true);
  ev.setUint16(10, centralDir.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);
  parts.push(end);

  return new Blob(parts, { type: "application/zip" });
}

/** CRC32 helper */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
