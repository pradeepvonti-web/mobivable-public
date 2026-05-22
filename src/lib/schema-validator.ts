/**
 * Schema validation & auto-fix for AI-generated mobile app JSON.
 * Catches common AI mistakes and repairs them before rendering.
 */
import type { MobileAppSchema, MElement, MScreen } from "./mobile-app-schema";

export type ValidationIssue = {
  severity: "error" | "warning" | "info";
  path: string;
  message: string;
  autoFixed: boolean;
};

const VALID_ELEMENT_TYPES = new Set([
  "greeting", "progress-ring", "stat-row", "button", "activity-feed",
  "card", "text", "input", "image", "list", "donut-chart", "bar-chart",
  "toggle", "divider", "spacer", "section", "header", "search-bar",
  "avatar", "badge", "slider", "tab-bar", "bottom-sheet", "carousel",
  "rating", "chip-group", "notification", "price-tag", "step-indicator",
  "countdown", "grid-cards", "hero-banner",
  // Premium primitives
  "glass-card", "gradient-mesh-bg", "parallax-hero", "marquee",
  "stat-card-xl", "feature-showcase", "testimonial", "pricing-card",
  "onboarding-slide",
]);

const VALID_SCREEN_LAYOUTS = new Set([
  "stack", "split-hero", "bento-grid", "magazine", "full-bleed",
]);

const VALID_ENTRANCES = new Set([
  "none", "fade-up", "fade-in", "scale-in",
  "slide-left", "slide-right", "pop", "blur-in",
]);

const VALID_GESTURES = new Set(["tap-scale", "press-glow", "swipe-hint"]);


/** Validate and auto-fix an element */
function fixElement(el: unknown, path: string, issues: ValidationIssue[]): MElement | null {
  if (!el || typeof el !== "object") {
    issues.push({ severity: "error", path, message: "Element is not an object", autoFixed: false });
    return null;
  }

  const e = el as Record<string, unknown>;

  // Missing type
  if (!e.type || typeof e.type !== "string") {
    issues.push({ severity: "error", path, message: "Element missing 'type' field", autoFixed: false });
    return null;
  }

  // Unknown type → convert to text fallback
  if (!VALID_ELEMENT_TYPES.has(e.type)) {
    issues.push({ severity: "warning", path, message: `Unknown element type "${e.type}", converted to text`, autoFixed: true });
    return { type: "text", props: { content: `[${e.type}]`, size: "sm", color: "muted" } };
  }

  // Ensure props exists
  if (!e.props && e.type !== "divider" && e.type !== "spacer") {
    issues.push({ severity: "warning", path, message: `Element "${e.type}" missing props, added defaults`, autoFixed: true });
    e.props = {};
  }

  // Fix nested children in card/section/glass-card/gradient-mesh-bg
  if (e.type === "card" || e.type === "section" || e.type === "glass-card" || e.type === "gradient-mesh-bg") {
    const props = (e.props ?? {}) as Record<string, unknown>;
    if (Array.isArray(props.children)) {
      props.children = (props.children as unknown[])
        .map((child, i) => fixElement(child, `${path}.children[${i}]`, issues))
        .filter(Boolean);
    }
  }


  // Fix common prop issues
  const props = (e.props ?? {}) as Record<string, unknown>;

  // progress-ring: ensure numeric values
  if (e.type === "progress-ring") {
    if (typeof props.value !== "number") {
      props.value = Number(props.value) || 0;
      issues.push({ severity: "info", path, message: "Coerced progress-ring value to number", autoFixed: true });
    }
    if (typeof props.max !== "number") {
      props.max = Number(props.max) || 100;
      issues.push({ severity: "info", path, message: "Coerced progress-ring max to number", autoFixed: true });
    }
    if (!props.label) props.label = "Progress";
  }

  // stat-row: ensure stats array
  if (e.type === "stat-row" && !Array.isArray(props.stats)) {
    issues.push({ severity: "warning", path, message: "stat-row missing stats array", autoFixed: true });
    props.stats = [];
  }

  // bar-chart: ensure bars array
  if (e.type === "bar-chart" && !Array.isArray(props.bars)) {
    issues.push({ severity: "warning", path, message: "bar-chart missing bars array", autoFixed: true });
    props.bars = [];
  }

  // donut-chart: ensure segments array
  if (e.type === "donut-chart" && !Array.isArray(props.segments)) {
    issues.push({ severity: "warning", path, message: "donut-chart missing segments array", autoFixed: true });
    props.segments = [];
  }

  // list: ensure items array
  if (e.type === "list" && !Array.isArray(props.items)) {
    issues.push({ severity: "warning", path, message: "list missing items array", autoFixed: true });
    props.items = [];
  }

  // activity-feed: ensure items array
  if (e.type === "activity-feed" && !Array.isArray(props.items)) {
    issues.push({ severity: "warning", path, message: "activity-feed missing items array", autoFixed: true });
    props.items = [];
  }

  // text: ensure content string
  if (e.type === "text" && typeof props.content !== "string") {
    props.content = String(props.content ?? "");
    issues.push({ severity: "info", path, message: "Coerced text content to string", autoFixed: true });
  }

  // button: ensure label
  if (e.type === "button" && !props.label) {
    props.label = "Button";
    issues.push({ severity: "info", path, message: "Added default button label", autoFixed: true });
  }

  // greeting: ensure name
  if (e.type === "greeting" && !props.name) {
    props.name = "User";
    issues.push({ severity: "info", path, message: "Added default greeting name", autoFixed: true });
  }

  // New primitives — ensure required arrays/strings
  if (e.type === "marquee" && !Array.isArray(props.items)) {
    props.items = []; issues.push({ severity: "warning", path, message: "marquee missing items", autoFixed: true });
  }
  if (e.type === "pricing-card" && !Array.isArray(props.features)) {
    props.features = []; issues.push({ severity: "warning", path, message: "pricing-card missing features", autoFixed: true });
  }
  if (e.type === "testimonial" && typeof props.quote !== "string") {
    props.quote = String(props.quote ?? ""); issues.push({ severity: "info", path, message: "Coerced testimonial quote", autoFixed: true });
  }
  if (e.type === "stat-card-xl" && props.sparkline && !Array.isArray(props.sparkline)) {
    props.sparkline = []; issues.push({ severity: "warning", path, message: "stat-card-xl sparkline reset", autoFixed: true });
  }

  return el as MElement;
}

/** Validate and auto-fix a screen */
function fixScreen(screen: unknown, path: string, issues: ValidationIssue[]): MScreen | null {
  if (!screen || typeof screen !== "object") {
    issues.push({ severity: "error", path, message: "Screen is not an object", autoFixed: false });
    return null;
  }

  const s = screen as Record<string, unknown>;


  // Ensure id
  if (!s.id || typeof s.id !== "string") {
    s.id = `screen_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    issues.push({ severity: "warning", path, message: "Screen missing id, generated one", autoFixed: true });
  }

  // Ensure title
  if (!s.title || typeof s.title !== "string") {
    s.title = s.id as string;
    issues.push({ severity: "info", path, message: "Screen missing title, using id", autoFixed: true });
  }

  // Ensure icon
  if (!s.icon) {
    s.icon = "home";
    issues.push({ severity: "info", path, message: "Screen missing icon, defaulting to home", autoFixed: true });
  }

  // Validate layout
  if (s.layout && (typeof s.layout !== "string" || !VALID_SCREEN_LAYOUTS.has(s.layout as string))) {
    issues.push({ severity: "warning", path, message: `Unknown screen layout "${String(s.layout)}", using "stack"`, autoFixed: true });
    s.layout = "stack";
  }

  // Fix elements
  if (!Array.isArray(s.elements)) {
    issues.push({ severity: "warning", path, message: "Screen missing elements array", autoFixed: true });
    s.elements = [];
  } else {
    s.elements = (s.elements as unknown[])
      .map((el, i) => fixElement(el, `${path}.elements[${i}]`, issues))
      .filter(Boolean);
  }

  return s as unknown as MScreen;
}


/** Validate and auto-fix a full app schema */
export function validateAndFixSchema(
  raw: unknown,
): { schema: MobileAppSchema | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];

  if (!raw || typeof raw !== "object") {
    issues.push({ severity: "error", path: "root", message: "Schema is not an object", autoFixed: false });
    return { schema: null, issues };
  }

  const obj = raw as Record<string, unknown>;

  // Ensure name
  if (!obj.name || typeof obj.name !== "string") {
    obj.name = "Untitled App";
    issues.push({ severity: "info", path: "name", message: "Missing app name, using default", autoFixed: true });
  }

  // Ensure theme (string preset name OR full custom theme object)
  if (!obj.theme) {
    obj.theme = "dark_fitness";
    issues.push({ severity: "info", path: "theme", message: "Missing theme, using dark_fitness", autoFixed: true });
  } else if (typeof obj.theme === "object") {
    const t = obj.theme as Record<string, unknown>;
    const required = ["mode", "primary", "accent", "background", "card", "text", "muted", "border"];
    const missing = required.filter((k) => typeof t[k] !== "string");
    if (missing.length > 0) {
      obj.theme = "dark_fitness";
      issues.push({ severity: "warning", path: "theme", message: `Custom theme missing ${missing.join(", ")}, fell back to dark_fitness`, autoFixed: true });
    }
  }


  // Fix screens
  if (!Array.isArray(obj.screens) || obj.screens.length === 0) {
    issues.push({ severity: "error", path: "screens", message: "No screens defined", autoFixed: false });
    return { schema: null, issues };
  }

  obj.screens = (obj.screens as unknown[])
    .map((s, i) => fixScreen(s, `screens[${i}]`, issues))
    .filter(Boolean);

  if ((obj.screens as unknown[]).length === 0) {
    issues.push({ severity: "error", path: "screens", message: "All screens invalid after fixing", autoFixed: false });
    return { schema: null, issues };
  }

  // Fix navigation
  if (!obj.navigation || typeof obj.navigation !== "object") {
    const screens = obj.screens as MScreen[];
    obj.navigation = {
      type: "bottom-tabs",
      items: screens.slice(0, 5).map(s => ({ screen: s.id, label: s.title, icon: s.icon })),
    };
    issues.push({ severity: "warning", path: "navigation", message: "Auto-generated navigation from screens", autoFixed: true });
  }

  return { schema: obj as unknown as MobileAppSchema, issues };
}

/** Format issues as a human-readable summary */
export function formatIssuesSummary(issues: ValidationIssue[]): string {
  if (issues.length === 0) return "✅ Schema is valid — no issues detected.";
  const errors = issues.filter(i => i.severity === "error");
  const warnings = issues.filter(i => i.severity === "warning");
  const infos = issues.filter(i => i.severity === "info");
  const autoFixed = issues.filter(i => i.autoFixed);

  let summary = `Found ${issues.length} issue(s): ${errors.length} errors, ${warnings.length} warnings, ${infos.length} info.`;
  if (autoFixed.length > 0) summary += ` Auto-fixed ${autoFixed.length}.`;
  return summary;
}
