/**
 * Built-in agent skills — reusable, on-demand instruction blocks the build
 * agent loads via the `invoke_skill` MCP tool (mirrors fastshot's "Skill" step).
 *
 * Unlike user skills in `mcp_agent_skills` (expanded client-side via @mentions),
 * these ship with the product and are always available to the agent. `frontend-design`
 * is the one the Studio agent invokes during a real Expo build, right after it
 * reads the mockup/scaffold and before it writes screens, to anchor the UI on a
 * consistent, premium design system derived from the approved brief.
 *
 * Keep each body tight (well under the 8 KB user-skill cap) — it's injected into
 * the agent's context on every invocation.
 */

export const FRONTEND_DESIGN_SKILL = `# Skill: frontend-design — build a premium Expo (React Native) UI

You are turning the APPROVED design brief + mockup into a polished Expo Router app.
The brief's palette, typography, and screen list are the source of truth. Follow this
discipline so the result looks Dribbble-grade and compiles under TypeScript strict mode.

## 1. Lock the design system FIRST (before any screen)
Create a single source of truth, e.g. \`constants/theme.ts\`, exporting:
- \`colors\`: map the brief palette verbatim — background, card/surface, text, muted,
  border, primary, accent, success, danger. Add on-primary text color for contrast.
- \`spacing\`: a 4-based scale { xs:4, sm:8, md:12, lg:16, xl:24, xxl:32 }. Use it everywhere; never hardcode random pixel gaps.
- \`radius\`: { sm:8, md:12, lg:20, pill:999 } matched to the brief's radius mood.
- \`typography\`: sizes (display:28, title:20, body:15, caption:12) + weights. Use the brief fonts;
  if they aren't system fonts, load with expo-font, otherwise fall back to system.
- \`shadow\`: a reusable elevation style (iOS shadow* + Android elevation).
Import these tokens in every component/screen — consistency is the #1 driver of "premium".

## 2. Build reusable components SECOND (\`components/\`)
Before screens, create the primitives the mockup implies, each styled from the theme tokens:
- \`Card\` (rounded surface + shadow + padding), \`ScreenContainer\` (SafeAreaView + screen padding + bg),
- \`StatTile\` (label + big value + optional delta), \`ProgressBar\`, \`SectionHeader\`,
- \`Button\` (primary/secondary/ghost variants, pressed feedback via Pressable),
- charts with **react-native-svg** (DonutChart, BarChart) — NOT web SVG. Add react-native-svg to deps.
- \`EmptyState\`, \`Badge\`, \`IconPill\`. Icons via \`@expo/vector-icons\` (Ionicons).

## 3. Build screens THIRD (file-based routes under \`app/\`)
- Tabs in \`app/(tabs)/_layout.tsx\` with 3–5 tabs, real icons, active color = primary.
- Each screen: \`ScreenContainer\` → header → content composed from the reusable components.
- Use \`FlatList\` for lists (never .map a long array into a ScrollView).
- Wire navigation with \`expo-router\` (\`<Link>\`, \`router.push('/route')\`). Routes must match files.

## 4. Realistic data + states
- Seed believable domain data (real names, amounts, dates) — never "Item 1"/lorem.
- Every screen handles: loading (skeleton), empty (EmptyState), and the populated state.
- Keep app state in a small store (e.g. zustand) or React context; seed it on first load.

## 5. React Native rules (avoid the common compile/runtime traps)
- NO \`className\` / Tailwind / web CSS. Style with \`StyleSheet.create\` + theme tokens.
- All visible text MUST be inside <Text>. Strings cannot be bare children of <View>.
- Layout is flexbox-only; no \`grid\`, no \`position: fixed\`, no \`vh/vw\`, no \`box-shadow\` string.
- Respect safe areas (react-native-safe-area-context). Images: \`expo-image\` or RN <Image> with explicit size.
- Pressables get \`hitSlop\` and a pressed style; inputs use the right \`keyboardType\`.

## 6. Color & spacing polish (the 10%)
- 60/30/10: background dominates, surfaces/secondary next, primary/accent only for emphasis & CTAs.
- Consistent vertical rhythm (use spacing tokens). Generous card padding. Subtle, single shadow level.
- Sufficient contrast for text on every surface.

## 7. Verify before declaring done
- Run \`bunx tsc --noEmit\` and fix every error. Run \`bun run lint\` and clear warnings.
- Confirm each route file exists for every navigation target. Then start the live preview.
`;

/** name → body. Add future built-ins here. */
export const BUILTIN_SKILLS: Record<string, string> = {
  "frontend-design": FRONTEND_DESIGN_SKILL,
};

/** Return a built-in skill body by name, or null if there's no such built-in. */
export function getBuiltinSkill(name: string): string | null {
  const key = String(name ?? "")
    .trim()
    .toLowerCase();
  return BUILTIN_SKILLS[key] ?? null;
}

/** Names of all built-in skills (for error messages / discovery). */
export function builtinSkillNames(): string[] {
  return Object.keys(BUILTIN_SKILLS);
}
