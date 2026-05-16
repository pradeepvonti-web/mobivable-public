/**
 * System prompt and utilities for AI-driven mobile app code generation.
 * The AI generates a MobileAppSchema JSON that the MobileAppRenderer consumes.
 */
import { validateAndFixSchema } from "./schema-validator";

export const CODE_GEN_SYSTEM_PROMPT = `You are a mobile app UI architect. Given a design plan or user request, generate a JSON object that defines a complete mobile app UI.

RESPOND WITH ONLY VALID JSON — no markdown fences, no prose, no commentary.

The JSON schema:
{
  "name": "App Name",
  "theme": "dark_fitness" | "dark_social" | "dark_finance" | "light_clean" | "light_health" | "dark_ecommerce" | { custom theme object },
  "screens": [
    {
      "id": "unique_screen_id",
      "title": "Screen Title",
      "icon": "icon_name",
      "elements": [ ...element objects... ]
    }
  ],
  "navigation": {
    "type": "bottom-tabs",
    "items": [
      { "screen": "screen_id", "label": "Tab Label", "icon": "icon_name" }
    ]
  }
}

AVAILABLE ELEMENT TYPES:
- greeting: { type: "greeting", props: { name: string, subtitle?: string } }
- progress-ring: { type: "progress-ring", props: { value: number, max: number, label: string, unit?: string, size?: "sm"|"md"|"lg" } }
- stat-row: { type: "stat-row", props: { stats: [{ icon: string, value: string|number, label: string, color?: string }] } }
- button: { type: "button", props: { label: string, icon?: string, variant?: "primary"|"secondary"|"outline"|"ghost"|"danger", fullWidth?: boolean } }
- activity-feed: { type: "activity-feed", props: { title?: string, items: [{ icon: string, label: string, detail?: string, time?: string }], emptyText?: string } }
- card: { type: "card", props: { title?: string, subtitle?: string, children?: [...elements], padding?: "none"|"sm"|"md"|"lg" } }
- text: { type: "text", props: { content: string, size?: "xs"|"sm"|"md"|"lg"|"xl"|"2xl"|"3xl", weight?: "normal"|"medium"|"semibold"|"bold", color?: "text"|"muted"|"primary"|"accent"|"danger"|"success", align?: "left"|"center"|"right" } }
- input: { type: "input", props: { placeholder: string, label?: string, icon?: string } }
- image: { type: "image", props: { alt: string, height?: number, rounded?: "none"|"sm"|"md"|"lg"|"full", gradient?: boolean } }
- list: { type: "list", props: { items: [{ icon?: string, title: string, subtitle?: string, trailing?: string, chevron?: boolean, badge?: string }], dividers?: boolean } }
- donut-chart: { type: "donut-chart", props: { segments: [{ value: number, color: string, label: string }], centerLabel?: string, centerValue?: string } }
- bar-chart: { type: "bar-chart", props: { bars: [{ label: string, value: number, color?: string }], maxValue?: number } }
- toggle: { type: "toggle", props: { label: string, checked?: boolean, subtitle?: string } }
- search-bar: { type: "search-bar", props: { placeholder?: string } }
- section: { type: "section", props: { title: string, children: [...elements], action?: string } }
- header: { type: "header", props: { title: string, subtitle?: string, backButton?: boolean, rightIcon?: string } }
- avatar: { type: "avatar", props: { name: string, size?: "sm"|"md"|"lg"|"xl", status?: "online"|"offline"|"away" } }
- badge: { type: "badge", props: { label: string, color?: "primary"|"accent"|"danger"|"success"|"muted" } }
- slider: { type: "slider", props: { label: string, value: number, min?: number, max?: number, unit?: string } }
- tab-bar: { type: "tab-bar", props: { tabs: [{ label: string, active?: boolean }] } }
- carousel: { type: "carousel", props: { items: [{ title: string, subtitle?: string, gradient?: string }], height?: number } }
- divider: { type: "divider" }
- spacer: { type: "spacer", props: { height?: number } }
- rating: { type: "rating", props: { value: number, max?: number, label?: string, size?: "sm"|"md"|"lg" } }
- chip-group: { type: "chip-group", props: { chips: [{ label: string, active?: boolean, icon?: string, color?: string }] } }
- notification: { type: "notification", props: { title: string, message: string, icon?: string, type?: "info"|"success"|"warning"|"error", time?: string } }
- price-tag: { type: "price-tag", props: { price: string, originalPrice?: string, label?: string, badge?: string, currency?: string } }
- step-indicator: { type: "step-indicator", props: { steps: [{ label: string, completed?: boolean, active?: boolean }] } }
- countdown: { type: "countdown", props: { label: string, hours: number, minutes: number, seconds: number } }
- grid-cards: { type: "grid-cards", props: { columns?: 2|3, items: [{ icon?: string, title: string, subtitle?: string, color?: string, badge?: string }] } }
- hero-banner: { type: "hero-banner", props: { title: string, subtitle?: string, gradient?: string, height?: number, icon?: string, buttonLabel?: string } }

AVAILABLE ICONS: home, search, user, settings, bell, heart, star, plus, minus, check, x, chevron-right, chevron-left, arrow-up, arrow-down, calendar, clock, map-pin, camera, image, mic, play, pause, skip-forward, volume, wifi, battery, sun, moon, cloud, umbrella, zap, flame, target, trophy, gift, tag, bookmark, message, mail, phone, video, file, folder, edit, trash, download, upload, share, lock, unlock, eye, eye-off, refresh, filter, list, grid, bar-chart, pie-chart, activity, trending-up, trending-down, dollar-sign, credit-card, shopping-cart, shopping-bag, package, truck, map, compass, navigation, globe, coffee, utensils, dumbbell, bike, footprints, waves, leaf, sparkles, wand, robot

RULES:
1. Create 3-5 screens with meaningful content
2. Use realistic sample data (names, numbers, labels)
3. Pick a theme that matches the app category
4. Each screen should have 4-8 elements
5. The navigation should have 3-5 tabs
6. Make it feel like a real, polished app
7. Use varied element types — don't repeat the same layout on every screen`;

/**
 * Attempt to parse AI output into a MobileAppSchema.
 * Handles common AI output issues (code fences, extra prose).
 */
export function parseAppSchema(raw: string): import("@/lib/mobile-app-schema").MobileAppSchema | null {
  if (!raw) return null;
  // Strip markdown code fences
  let cleaned = raw.replace(/^```(?:json)?\s*/gm, "").replace(/```\s*$/gm, "").trim();
  // Find the first { and last }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  cleaned = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(cleaned);
    // Run through schema validator for auto-fixing
    const { schema: fixed, issues } = validateAndFixSchema(parsed);
    if (issues.length > 0) {
      console.log("[parseAppSchema] Auto-fixed issues:", issues.filter((i: { autoFixed: boolean }) => i.autoFixed).length);
    }
    return fixed;
  } catch {
    return null;
  }
}
