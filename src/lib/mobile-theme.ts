/**
 * Mobile app theme definitions for the live preview renderer.
 * AI agents pick or generate a theme; the renderer applies it.
 */

export type MobileTypography = {
  headingFont: string;   // Google Font family name
  bodyFont: string;
  displayFont?: string;
  scale?: "compact" | "comfortable" | "editorial";
};

export type MobileRadius = {
  sm: number; md: number; lg: number; xl: number; pill: number;
};

export type MobileSpacing = {
  xs: number; sm: number; md: number; lg: number; xl: number;
};

export type MobileShadows = {
  sm: string; md: string; lg: string;
};

export type MobileMotion = {
  duration: number;            // ms
  easing: string;              // cubic-bezier
  intensity: "subtle" | "medium" | "bold";
  /** Optional named spring presets the AI/renderer can reference. */
  springs?: {
    snappy?:   { duration: number; easing: string };
    gentle?:   { duration: number; easing: string };
    bouncy?:   { duration: number; easing: string };
  };
};

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

  // NEW: full design system
  typography?: MobileTypography;
  radius?: MobileRadius;
  spacing?: MobileSpacing;
  shadows?: MobileShadows;
  motion?: MobileMotion;
};

/** Curated Google Font pairs. AI must pick a heading from this list. */
export const FONT_ALLOWLIST = [
  "Inter", "Space Grotesk", "DM Sans", "Manrope", "Plus Jakarta Sans",
  "Sora", "Outfit", "Figtree", "Urbanist", "Epilogue", "Syne",
  "Bricolage Grotesque", "Geist", "Instrument Serif", "DM Serif Display",
  "Cormorant Garamond", "Fraunces", "Playfair Display", "Lora", "Libre Baskerville",
  "Bebas Neue", "Archivo", "Archivo Black", "Hind", "Barlow",
  "Abril Fatface", "Cabin", "JetBrains Mono", "Space Mono", "IBM Plex Sans",
];

const DEFAULT_TYPOGRAPHY: MobileTypography = {
  headingFont: "Inter",
  bodyFont: "Inter",
  scale: "comfortable",
};
const DEFAULT_RADIUS: MobileRadius = { sm: 6, md: 10, lg: 16, xl: 24, pill: 999 };
const DEFAULT_SPACING: MobileSpacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
const DEFAULT_SHADOWS: MobileShadows = {
  sm: "0 1px 2px rgba(0,0,0,0.08)",
  md: "0 6px 18px rgba(0,0,0,0.18)",
  lg: "0 20px 50px rgba(0,0,0,0.28)",
};
const DEFAULT_MOTION: MobileMotion = {
  duration: 260,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  intensity: "medium",
  springs: {
    snappy: { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    gentle: { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    bouncy: { duration: 420, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  },
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

/** Snap a font name to the allowlist (case-insensitive). */
export function snapFont(name: string | undefined, fallback: string): string {
  if (!name) return fallback;
  const lower = name.toLowerCase().trim();
  const hit = FONT_ALLOWLIST.find((f) => f.toLowerCase() === lower);
  return hit ?? fallback;
}

/** Fill missing fields on a possibly-partial theme. */
export function normalizeTheme(t: MobileTheme): MobileTheme {
  const typography: MobileTypography = {
    headingFont: snapFont(t.typography?.headingFont, "Inter"),
    bodyFont: snapFont(t.typography?.bodyFont, "Inter"),
    displayFont: t.typography?.displayFont ? snapFont(t.typography.displayFont, "") || undefined : undefined,
    scale: t.typography?.scale ?? "comfortable",
  };
  return {
    ...t,
    typography,
    radius: { ...DEFAULT_RADIUS, ...(t.radius ?? {}) },
    spacing: { ...DEFAULT_SPACING, ...(t.spacing ?? {}) },
    shadows: { ...DEFAULT_SHADOWS, ...(t.shadows ?? {}) },
    motion: { ...DEFAULT_MOTION, ...(t.motion ?? {}) },
  };
}

export function resolveTheme(themeNameOrCustom?: string | MobileTheme): MobileTheme {
  if (!themeNameOrCustom) return normalizeTheme(MOBILE_THEMES.dark_fitness);
  if (typeof themeNameOrCustom === "object") return normalizeTheme(themeNameOrCustom);
  return normalizeTheme(MOBILE_THEMES[themeNameOrCustom] ?? MOBILE_THEMES.dark_fitness);
}

/** CSS custom properties from a theme — injectable into the preview container. */
export function themeToCSSVars(t: MobileTheme): Record<string, string> {
  const r = t.radius ?? DEFAULT_RADIUS;
  const s = t.spacing ?? DEFAULT_SPACING;
  const sh = t.shadows ?? DEFAULT_SHADOWS;
  const m = t.motion ?? DEFAULT_MOTION;
  const ty = t.typography ?? DEFAULT_TYPOGRAPHY;
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
    "--m-font-heading": `'${ty.headingFont}', -apple-system, sans-serif`,
    "--m-font-body": `'${ty.bodyFont}', -apple-system, sans-serif`,
    "--m-font-display": `'${ty.displayFont ?? ty.headingFont}', -apple-system, sans-serif`,
    "--m-radius-sm": `${r.sm}px`,
    "--m-radius-md": `${r.md}px`,
    "--m-radius-lg": `${r.lg}px`,
    "--m-radius-xl": `${r.xl}px`,
    "--m-radius-pill": `${r.pill}px`,
    "--m-space-xs": `${s.xs}px`,
    "--m-space-sm": `${s.sm}px`,
    "--m-space-md": `${s.md}px`,
    "--m-space-lg": `${s.lg}px`,
    "--m-space-xl": `${s.xl}px`,
    "--m-shadow-sm": sh.sm,
    "--m-shadow-md": sh.md,
    "--m-shadow-lg": sh.lg,
    "--m-duration": `${m.duration}ms`,
    "--m-ease": m.easing,
  };
}

/** Build a Google Fonts <link> href for the theme's fonts. */
export function themeFontHref(t: MobileTheme): string {
  const ty = t.typography ?? DEFAULT_TYPOGRAPHY;
  const families = new Set<string>();
  families.add(ty.headingFont);
  families.add(ty.bodyFont);
  if (ty.displayFont) families.add(ty.displayFont);
  const parts = Array.from(families)
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${parts}&display=swap`;
}
