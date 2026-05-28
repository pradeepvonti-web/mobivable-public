/**
 * MobileAppSchema → React Native source renderer.
 *
 * Pure function — given a screen and a theme, returns the JSX + style
 * declarations for an `App.tsx`-style file that renders that screen
 * with real RN primitives.
 *
 * What ships in v1:
 *   - Renderers for the ~15 element types we see on most generated
 *     apps (text, button, card, image, list, header, section, etc.)
 *   - A graceful fallback for unknown types — emits a placeholder card
 *     so the user sees "this widget didn't render" instead of a crash.
 *   - No expo-router, no navigation: the caller picks a single screen
 *     (usually `schema.screens[0]`) and we render it. Snack uses this
 *     for the preview iframe; the Expo exporter uses it for app/index.tsx.
 *
 * Intentionally NOT in v1:
 *   - Multi-screen navigation. The Expo export currently has just Home
 *     and About hardcoded; threading real expo-router files through
 *     the export is a separate (larger) follow-up.
 *   - Icons. expo-vector-icons would pull in a heavy dep for Snack;
 *     icon spots render as glyphs/initials for now.
 *   - Charts. MBarChart / MProgressRing render simplified equivalents
 *     (a labeled box for charts; a tinted circle for ProgressRing).
 *
 * Anything not handled goes through `renderUnknown` which emits a
 * boxed placeholder. The element's `type` is shown so the user sees
 * which widgets need wiring.
 */

export interface SchemaTheme {
  primary: string;
  background: string;
  card: string;
  text: string;
  muted: string;
}

interface RenderableScreen {
  id?: string;
  title?: string;
  elements?: unknown[];
  scrollable?: boolean;
}

export interface RenderedApp {
  /** Full source for `App.tsx`. */
  appTsx: string;
  /** RN dependencies the renderer added beyond the base set. Caller
   *  merges these into the Snack manifest / exporter's package.json. */
  dependencies: Record<string, string>;
}

/**
 * Top-level entry. Renders the first screen in `screens` as the app
 * body inside a SafeAreaView + (optional) ScrollView.
 */
export function renderSchemaToRn(args: {
  appName: string;
  theme: SchemaTheme;
  screen: RenderableScreen;
}): RenderedApp {
  const { appName, theme, screen } = args;
  const elements = Array.isArray(screen.elements) ? screen.elements : [];
  const safeAppName = appName.replace(/[<>"&]/g, "").slice(0, 60) || "App";
  const screenTitle = (screen.title ?? "Home").toString().replace(/[<>"&]/g, "");

  const childrenJsx = elements
    .map((el, idx) => renderElement(el, theme, 4, `el-${idx}`))
    .filter(Boolean)
    .join("\n");

  const wrapped = screen.scrollable !== false
    ? `<ScrollView contentContainerStyle={styles.content}>${childrenJsx ? "\n" + childrenJsx + "\n          " : ""}</ScrollView>`
    : `<View style={styles.content}>${childrenJsx ? "\n" + childrenJsx + "\n          " : ""}</View>`;

  const appTsx = `import { StatusBar } from "expo-status-bar";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const theme = {
  background: ${JSON.stringify(theme.background)},
  card: ${JSON.stringify(theme.card)},
  primary: ${JSON.stringify(theme.primary)},
  text: ${JSON.stringify(theme.text)},
  muted: ${JSON.stringify(theme.muted)},
};

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={["top"]}>
        <StatusBar style="light" />
        <Text style={styles.kicker}>${safeAppName.toUpperCase()}</Text>
        <Text style={styles.screenTitle}>${screenTitle}</Text>
        ${wrapped}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.background },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  kicker: { color: theme.primary, fontSize: 11, letterSpacing: 3, fontWeight: "600", paddingHorizontal: 20, paddingTop: 12 },
  screenTitle: { color: theme.text, fontSize: 28, fontWeight: "800", paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 },

  // ── Element-specific styles emitted alongside the elements below ──
  text: { color: theme.text, fontSize: 16 },
  textMuted: { color: theme.muted, fontSize: 14 },
  textHeading: { color: theme.text, fontSize: 22, fontWeight: "800" },
  textSubheading: { color: theme.text, fontSize: 17, fontWeight: "700" },
  card: { backgroundColor: theme.card, borderRadius: 16, padding: 16, gap: 8 },
  cardTitle: { color: theme.text, fontSize: 17, fontWeight: "700" },
  cardSubtitle: { color: theme.muted, fontSize: 13 },
  buttonPrimary: { backgroundColor: theme.primary, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: "center" },
  buttonOutline: { borderWidth: 1, borderColor: theme.primary, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: "center" },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  buttonTextOutline: { color: theme.primary, fontSize: 15, fontWeight: "700" },
  image: { width: "100%", borderRadius: 12, backgroundColor: theme.card },
  imagePlaceholder: { width: "100%", aspectRatio: 16 / 9, backgroundColor: theme.card, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  imagePlaceholderText: { color: theme.muted, fontSize: 12 },
  divider: { height: 1, backgroundColor: theme.muted, opacity: 0.2 },
  section: { gap: 10 },
  sectionTitle: { color: theme.text, fontSize: 18, fontWeight: "700" },
  sectionAction: { color: theme.primary, fontSize: 13, fontWeight: "600" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  listTitle: { color: theme.text, fontSize: 15, fontWeight: "600" },
  listSubtitle: { color: theme.muted, fontSize: 13 },
  listTrailing: { color: theme.muted, fontSize: 13 },
  avatar: { backgroundColor: theme.primary, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  avatarText: { color: "#ffffff", fontWeight: "700" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "700" },
  statRow: { flexDirection: "row", gap: 10 },
  statCell: { flex: 1, backgroundColor: theme.card, borderRadius: 12, padding: 12, gap: 4 },
  statValue: { color: theme.text, fontSize: 20, fontWeight: "800" },
  statLabel: { color: theme.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 },
  progressRingOuter: { alignItems: "center", justifyContent: "center", padding: 16 },
  progressRingInner: { width: 140, height: 140, borderRadius: 70, borderWidth: 10, borderColor: theme.primary, alignItems: "center", justifyContent: "center" },
  progressRingValue: { color: theme.text, fontSize: 30, fontWeight: "800" },
  progressRingLabel: { color: theme.muted, fontSize: 12, marginTop: 4 },
  searchBar: { backgroundColor: theme.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  searchBarText: { color: theme.muted, fontSize: 14 },
  placeholder: { backgroundColor: theme.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.primary, borderStyle: "dashed" },
  placeholderText: { color: theme.muted, fontSize: 12, textAlign: "center" },
  placeholderType: { color: theme.primary, fontSize: 11, fontFamily: "Courier", fontWeight: "700", textAlign: "center", marginTop: 2 },
});
`;

  return {
    appTsx,
    dependencies: {
      "react-native-safe-area-context": "4.10.5",
    },
  };
}

// ─── Element renderers ─────────────────────────────────────────────

type AnyEl = {
  type?: string;
  props?: Record<string, unknown>;
};

function renderElement(
  raw: unknown,
  theme: SchemaTheme,
  depth: number,
  key: string,
): string {
  const el = (raw as AnyEl) ?? {};
  const type = el.type ?? "";
  const props = (el.props ?? {}) as Record<string, unknown>;
  const pad = " ".repeat(depth * 2 + 6);

  switch (type) {
    case "greeting":
      return renderGreeting(props, pad, key);
    case "text":
      return renderText(props, pad, key);
    case "header":
      return renderHeader(props, pad, key);
    case "card":
      return renderCard(props, theme, pad, key);
    case "section":
      return renderSection(props, theme, pad, key);
    case "button":
      return renderButton(props, pad, key);
    case "image":
      return renderImage(props, pad, key);
    case "list":
      return renderList(props, pad, key);
    case "avatar":
      return renderAvatar(props, pad, key);
    case "badge":
      return renderBadge(props, pad, key);
    case "divider":
      return `${pad}<View key={${JSON.stringify(key)}} style={styles.divider} />`;
    case "spacer": {
      const h = typeof props.height === "number" ? props.height : 12;
      return `${pad}<View key={${JSON.stringify(key)}} style={{ height: ${h} }} />`;
    }
    case "stat-row":
      return renderStatRow(props, pad, key);
    case "progress-ring":
      return renderProgressRing(props, pad, key);
    case "search-bar":
      return renderSearchBar(props, pad, key);
    default:
      return renderUnknown(type || "(no type)", pad, key);
  }
}

function renderGreeting(
  props: Record<string, unknown>,
  pad: string,
  key: string,
): string {
  const name = strProp(props, "name", "there");
  const subtitle = strProp(props, "subtitle", "");
  return `${pad}<View key={${JSON.stringify(key)}} style={styles.card}>
${pad}  <Text style={styles.cardTitle}>{${jsString(`Hi, ${name}`)}}</Text>
${subtitle ? `${pad}  <Text style={styles.cardSubtitle}>{${jsString(subtitle)}}</Text>\n` : ""}${pad}</View>`;
}

function renderText(
  props: Record<string, unknown>,
  pad: string,
  key: string,
): string {
  const content = strProp(props, "content", "");
  const size = strProp(props, "size", "md");
  const weight = strProp(props, "weight", "normal");
  let style = "styles.text";
  if (size === "xl" || size === "2xl" || size === "3xl") style = "styles.textHeading";
  else if (size === "lg" && (weight === "bold" || weight === "semibold")) style = "styles.textSubheading";
  else if (weight === "bold" || weight === "semibold") style = "styles.textSubheading";
  return `${pad}<Text key={${JSON.stringify(key)}} style={${style}}>{${jsString(content)}}</Text>`;
}

function renderHeader(
  props: Record<string, unknown>,
  pad: string,
  key: string,
): string {
  const title = strProp(props, "title", "");
  const subtitle = strProp(props, "subtitle", "");
  return `${pad}<View key={${JSON.stringify(key)}} style={styles.headerRow}>
${pad}  <View style={{ flex: 1 }}>
${pad}    <Text style={styles.textHeading}>{${jsString(title)}}</Text>
${subtitle ? `${pad}    <Text style={styles.textMuted}>{${jsString(subtitle)}}</Text>\n` : ""}${pad}  </View>
${pad}</View>`;
}

function renderCard(
  props: Record<string, unknown>,
  theme: SchemaTheme,
  pad: string,
  key: string,
): string {
  const title = strProp(props, "title", "");
  const subtitle = strProp(props, "subtitle", "");
  const children = Array.isArray(props.children)
    ? (props.children as unknown[]).map((c, i) =>
        renderElement(c, theme, 1, `${key}-c${i}`),
      )
    : [];
  return `${pad}<View key={${JSON.stringify(key)}} style={styles.card}>
${title ? `${pad}  <Text style={styles.cardTitle}>{${jsString(title)}}</Text>\n` : ""}${subtitle ? `${pad}  <Text style={styles.cardSubtitle}>{${jsString(subtitle)}}</Text>\n` : ""}${children.join("\n")}
${pad}</View>`;
}

function renderSection(
  props: Record<string, unknown>,
  theme: SchemaTheme,
  pad: string,
  key: string,
): string {
  const title = strProp(props, "title", "");
  const action = strProp(props, "action", "");
  const children = Array.isArray(props.children)
    ? (props.children as unknown[]).map((c, i) =>
        renderElement(c, theme, 1, `${key}-c${i}`),
      )
    : [];
  return `${pad}<View key={${JSON.stringify(key)}} style={styles.section}>
${pad}  <View style={styles.headerRow}>
${pad}    <Text style={styles.sectionTitle}>{${jsString(title)}}</Text>
${action ? `${pad}    <Text style={styles.sectionAction}>{${jsString(action)}}</Text>\n` : ""}${pad}  </View>
${children.join("\n")}
${pad}</View>`;
}

function renderButton(
  props: Record<string, unknown>,
  pad: string,
  key: string,
): string {
  const label = strProp(props, "label", "Button");
  const variant = strProp(props, "variant", "primary");
  const outline = variant === "outline" || variant === "ghost";
  const style = outline ? "styles.buttonOutline" : "styles.buttonPrimary";
  const textStyle = outline ? "styles.buttonTextOutline" : "styles.buttonText";
  return `${pad}<Pressable key={${JSON.stringify(key)}} style={${style}}>
${pad}  <Text style={${textStyle}}>{${jsString(label)}}</Text>
${pad}</Pressable>`;
}

function renderImage(
  props: Record<string, unknown>,
  pad: string,
  key: string,
): string {
  const src = strProp(props, "src", "");
  const alt = strProp(props, "alt", "");
  const aspect = strProp(props, "aspectRatio", "video");
  const aspectVal = aspect === "square" ? "1" : aspect === "wide" ? "21 / 9" : "16 / 9";
  if (!src) {
    return `${pad}<View key={${JSON.stringify(key)}} style={[styles.imagePlaceholder, { aspectRatio: ${aspectVal} }]}>
${pad}  <Text style={styles.imagePlaceholderText}>{${jsString(alt || "image")}}</Text>
${pad}</View>`;
  }
  return `${pad}<Image key={${JSON.stringify(key)}} source={{ uri: ${jsString(src)} }} style={[styles.image, { aspectRatio: ${aspectVal} }]} resizeMode="cover" />`;
}

function renderList(
  props: Record<string, unknown>,
  pad: string,
  key: string,
): string {
  const items = Array.isArray(props.items) ? (props.items as unknown[]) : [];
  const rendered = items
    .map((it, i) => {
      const item = (it ?? {}) as Record<string, unknown>;
      const title = strProp(item, "title", "");
      const subtitle = strProp(item, "subtitle", "");
      const trailing = strProp(item, "trailing", "");
      return `${pad}  <View key={${JSON.stringify(`${key}-i${i}`)}} style={styles.listItem}>
${pad}    <View style={{ flex: 1 }}>
${pad}      <Text style={styles.listTitle}>{${jsString(title)}}</Text>
${subtitle ? `${pad}      <Text style={styles.listSubtitle}>{${jsString(subtitle)}}</Text>\n` : ""}${pad}    </View>
${trailing ? `${pad}    <Text style={styles.listTrailing}>{${jsString(trailing)}}</Text>\n` : ""}${pad}  </View>`;
    })
    .join("\n");
  return `${pad}<View key={${JSON.stringify(key)}} style={styles.card}>
${rendered}
${pad}</View>`;
}

function renderAvatar(
  props: Record<string, unknown>,
  pad: string,
  key: string,
): string {
  const name = strProp(props, "name", "?");
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const sizeMap: Record<string, number> = { sm: 32, md: 40, lg: 56, xl: 80 };
  const size = sizeMap[strProp(props, "size", "md")] ?? 40;
  return `${pad}<View key={${JSON.stringify(key)}} style={[styles.avatar, { width: ${size}, height: ${size} }]}>
${pad}  <Text style={[styles.avatarText, { fontSize: ${Math.round(size * 0.4)} }]}>{${jsString(initials)}}</Text>
${pad}</View>`;
}

function renderBadge(
  props: Record<string, unknown>,
  pad: string,
  key: string,
): string {
  const label = strProp(props, "label", "");
  const color = strProp(props, "color", "primary");
  const bgMap: Record<string, string> = {
    primary: "theme.primary",
    accent: "theme.primary",
    danger: '"#ef4444"',
    success: '"#10b981"',
    muted: "theme.card",
  };
  const bg = bgMap[color] ?? "theme.primary";
  return `${pad}<View key={${JSON.stringify(key)}} style={[styles.badge, { backgroundColor: ${bg} }]}>
${pad}  <Text style={[styles.badgeText, { color: "#fff" }]}>{${jsString(label)}}</Text>
${pad}</View>`;
}

function renderStatRow(
  props: Record<string, unknown>,
  pad: string,
  key: string,
): string {
  const stats = Array.isArray(props.stats) ? (props.stats as unknown[]) : [];
  const cells = stats
    .map((s, i) => {
      const stat = (s ?? {}) as Record<string, unknown>;
      const value = String(stat.value ?? "");
      const label = strProp(stat, "label", "");
      return `${pad}  <View key={${JSON.stringify(`${key}-s${i}`)}} style={styles.statCell}>
${pad}    <Text style={styles.statValue}>{${jsString(value)}}</Text>
${pad}    <Text style={styles.statLabel}>{${jsString(label)}}</Text>
${pad}  </View>`;
    })
    .join("\n");
  return `${pad}<View key={${JSON.stringify(key)}} style={styles.statRow}>
${cells}
${pad}</View>`;
}

function renderProgressRing(
  props: Record<string, unknown>,
  pad: string,
  key: string,
): string {
  const value = typeof props.value === "number" ? props.value : 0;
  const max = typeof props.max === "number" && props.max > 0 ? props.max : 100;
  const label = strProp(props, "label", "");
  const unit = strProp(props, "unit", "%");
  const display = Math.round((value / max) * 100);
  return `${pad}<View key={${JSON.stringify(key)}} style={styles.progressRingOuter}>
${pad}  <View style={styles.progressRingInner}>
${pad}    <Text style={styles.progressRingValue}>{${jsString(`${display}${unit}`)}}</Text>
${pad}  </View>
${label ? `${pad}  <Text style={styles.progressRingLabel}>{${jsString(label)}}</Text>\n` : ""}${pad}</View>`;
}

function renderSearchBar(
  props: Record<string, unknown>,
  pad: string,
  key: string,
): string {
  const placeholder = strProp(props, "placeholder", "Search");
  return `${pad}<View key={${JSON.stringify(key)}} style={styles.searchBar}>
${pad}  <Text style={styles.searchBarText}>{${jsString(placeholder)}}</Text>
${pad}</View>`;
}

function renderUnknown(type: string, pad: string, key: string): string {
  return `${pad}<View key={${JSON.stringify(key)}} style={styles.placeholder}>
${pad}  <Text style={styles.placeholderText}>{${jsString("Widget not yet rendered:")}}</Text>
${pad}  <Text style={styles.placeholderType}>{${jsString(type)}}</Text>
${pad}</View>`;
}

// ─── helpers ───────────────────────────────────────────────────────

function strProp(props: Record<string, unknown>, key: string, def: string): string {
  const v = props[key];
  return typeof v === "string" ? v : def;
}

/** JS-string literal with double-quote escaping. Output is `"..."`. */
function jsString(s: string): string {
  return JSON.stringify(s.replace(/[()]/g, " "));
}
