/**
 * Mobile app theme definitions for the live preview renderer.
 * AI agents pick or generate a theme; the renderer applies it.
 */

export type MobileTheme = {
  mode: "dark" | "light";
  primary: string;
  accent: string;
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  danger: string;
  success: string;
  gradient?: [string, string];
};

export const MOBILE_THEMES: Record<string, MobileTheme> = {
  dark_fitness: {
    mode: "dark",
    primary: "#6366f1",
    accent: "#22c55e",
    background: "#0a0a1a",
    card: "#111827",
    text: "#f8fafc",
    muted: "#64748b",
    border: "#1e293b",
    danger: "#ef4444",
    success: "#22c55e",
    gradient: ["#6366f1", "#8b5cf6"],
  },
  dark_social: {
    mode: "dark",
    primary: "#3b82f6",
    accent: "#f59e0b",
    background: "#09090b",
    card: "#18181b",
    text: "#fafafa",
    muted: "#71717a",
    border: "#27272a",
    danger: "#ef4444",
    success: "#10b981",
    gradient: ["#3b82f6", "#2563eb"],
  },
  dark_finance: {
    mode: "dark",
    primary: "#10b981",
    accent: "#6366f1",
    background: "#020617",
    card: "#0f172a",
    text: "#f1f5f9",
    muted: "#475569",
    border: "#1e293b",
    danger: "#f43f5e",
    success: "#10b981",
    gradient: ["#10b981", "#059669"],
  },
  light_clean: {
    mode: "light",
    primary: "#6366f1",
    accent: "#f59e0b",
    background: "#ffffff",
    card: "#f8fafc",
    text: "#0f172a",
    muted: "#94a3b8",
    border: "#e2e8f0",
    danger: "#ef4444",
    success: "#22c55e",
    gradient: ["#6366f1", "#8b5cf6"],
  },
  light_health: {
    mode: "light",
    primary: "#059669",
    accent: "#0ea5e9",
    background: "#f0fdf4",
    card: "#ffffff",
    text: "#052e16",
    muted: "#6b7280",
    border: "#d1d5db",
    danger: "#dc2626",
    success: "#16a34a",
    gradient: ["#059669", "#10b981"],
  },
  dark_ecommerce: {
    mode: "dark",
    primary: "#f59e0b",
    accent: "#ec4899",
    background: "#0c0a09",
    card: "#1c1917",
    text: "#fafaf9",
    muted: "#78716c",
    border: "#292524",
    danger: "#ef4444",
    success: "#22c55e",
    gradient: ["#f59e0b", "#d97706"],
  },
};

export function resolveTheme(themeNameOrCustom?: string | MobileTheme): MobileTheme {
  if (!themeNameOrCustom) return MOBILE_THEMES.dark_fitness;
  if (typeof themeNameOrCustom === "object") return themeNameOrCustom;
  return MOBILE_THEMES[themeNameOrCustom] ?? MOBILE_THEMES.dark_fitness;
}

/** CSS custom properties from a theme — injectable into the preview container. */
export function themeToCSSVars(t: MobileTheme): Record<string, string> {
  return {
    "--m-primary": t.primary,
    "--m-accent": t.accent,
    "--m-bg": t.background,
    "--m-card": t.card,
    "--m-text": t.text,
    "--m-muted": t.muted,
    "--m-border": t.border,
    "--m-danger": t.danger,
    "--m-success": t.success,
    "--m-gradient-from": t.gradient?.[0] ?? t.primary,
    "--m-gradient-to": t.gradient?.[1] ?? t.primary,
  };
}
