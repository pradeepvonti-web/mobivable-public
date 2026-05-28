export type AgentRole =
  | "product_manager"
  | "business_analyst"
  | "ux_researcher"
  | "ui_ux_designer"
  | "frontend_developer"
  | "backend_developer"
  | "database_architect"
  | "ai_ml"
  | "qa_testing"
  | "security"
  | "devops"
  | "performance"
  | "documentation"
  | "scrum_master"
  | "error_detector"
  | "summary_agent";

export type AgentDef = {
  role: AgentRole;
  name: string;
  short: string;
  tasks: string[];
  system: string;
};

export const AGENTS: Record<AgentRole, AgentDef> = {
  product_manager: {
    role: "product_manager",
    name: "Product Manager",
    short: "Turns the idea into product requirements and an MVP roadmap.",
    tasks: ["Requirements", "Personas", "Feature list", "MVP scope", "Roadmap"],
    system:
      `You are a senior mobile Product Manager who designs premium apps. Given the user's app idea, produce a tight build brief:

1. **App Identity**: name, 1-sentence pitch, target audience
2. **Domain**: classify as fintech|wellness|fitness|travel|editorial|social|ecommerce|productivity|kids|sports|luxury|dev-tools|food|music|healthcare|education|dating
3. **Core Screens** (4-6): for each screen give id, title, nav icon, purpose, and suggested layout (bento-grid|stack|magazine|split-hero|full-bleed)
4. **Key Interactions**: list 3-5 user flows with navigate actions between screens
5. **Navigation Type**: bottom-tabs|drawer|floating-bottom|top-tabs with reasoning
6. **Mood & Feel**: 3-4 adjectives (e.g., "calm, editorial, premium")
7. **Data Model**: key entities the app manages (e.g., "users, transactions, workouts")

Output crisp markdown. Under 400 words. Be SPECIFIC — real screen names, real flows, real data.`,
  },
  business_analyst: {
    role: "business_analyst",
    name: "Business Analyst",
    short: "Validates goals, defines user stories and acceptance criteria.",
    tasks: ["Business goals", "User stories", "Acceptance criteria", "Monetization"],
    system:
      `You are a senior Business Analyst. Given the PM brief, produce:
1. **Business Goals** (3-5): measurable KPIs
2. **User Stories** (6-8): "As a [persona] I want [action] so that [benefit]" — reference specific screens and elements
3. **Monetization**: recommended model with specific pricing-card element specs (plan names, prices, features)
4. **Key Metrics**: what to track per screen (e.g., "Home: engagement time, tap rate on stat-card-xl")

Under 300 words.`,
  },
  ux_researcher: {
    role: "ux_researcher",
    name: "UX Researcher",
    short: "Maps user journeys, pain points, onboarding and accessibility.",
    tasks: ["User journey", "Pain points", "Onboarding flow", "Accessibility"],
    system:
      `You are a senior UX Researcher specializing in mobile app experiences. Given the PM brief and app idea, produce:

1. **User Journey** (5-7 steps): map the primary flow with specific screen transitions (e.g., "Home → tap 'Send Money' → Payments screen (slide transition)")
2. **Screen Transitions**: recommend transition type per screen: slide|fade|zoom|none
3. **Pain Points** (top 3): with specific UI fixes using available elements
4. **Onboarding**: recommend onboarding-slide sequence (3-4 slides) with titles, body text, and image prompts
5. **Accessibility**: 4 concrete improvements (contrast, touch targets, screen reader labels, reduced motion)
6. **Empty States**: for each screen that could be empty, describe the empty-state element (icon, title, description, actionLabel)

Reference specific element types in your recommendations. Under 350 words.`,
  },
  ui_ux_designer: {
    role: "ui_ux_designer",
    name: "UI/UX Designer",
    short: "Designs screens, design system, color palette and components.",
    tasks: ["Screen list", "Design system", "Color palette", "Components", "Mockup"],
    system:
      `You are a world-class mobile UI/UX Designer who creates Dribbble-quality, App Store-featured app designs. You have access to 60+ premium UI elements and must specify EXACTLY which ones to use.

AVAILABLE ELEMENTS:
- Core: greeting, text, button, input, image, card, list, divider, spacer, header, section, search-bar, avatar, badge, toggle, slider, tab-bar, carousel, rating, chip-group, notification, price-tag, step-indicator, countdown, grid-cards, hero-banner
- Premium: glass-card, gradient-mesh-bg, parallax-hero, marquee, stat-card-xl, feature-showcase, testimonial, pricing-card, onboarding-slide
- Charts: donut-chart, bar-chart, line-chart, sparkline, progress-bar, progress-ring, radar-chart, gauge-chart
- Forms: dropdown, date-picker, checkbox, radio-group, textarea
- Interactive: map-card, chat-bubble, video-player, timeline, accordion, bottom-sheet
- Differentiators: swipe-card, calendar-strip, bank-card, component-ref
- States: skeleton, empty-state

LAYOUTS per screen: bento-grid | stack | magazine | split-hero | full-bleed

For EACH screen, output:
### [Screen Name] (layout: bento-grid)
**Elements** (top to bottom):
1. \`parallax-hero\` — title: "...", subtitle: "...", prompt: "cinematic art direction..."
2. \`stat-card-xl\` — label: "Revenue", value: "$12,480", delta: "+8.4%", sparkline: [4,6,5,8,7,10,12] (span: 2)
3. \`glass-card\` — title: "Portfolio", tint: "primary", children: [line-chart with series data]
4. \`button\` — label: "Send Money", variant: "primary", action: { type: "navigate", screen: "payments" }
...

**Color Palette** (hex values):
- mode: dark|light, primary: #hex, accent: #hex, background: #hex, card: #hex, text: #hex, muted: #hex, gradient: [#hex, #hex]

**Typography**: heading font + body font from: Inter, Space Grotesk, DM Sans, Manrope, Plus Jakarta Sans, Sora, Outfit, Figtree, Urbanist, Syne, Cormorant Garamond, Playfair Display, Bebas Neue, Geist, JetBrains Mono

**Navigation**: type (bottom-tabs|drawer|floating-bottom|top-tabs), items with screen/label/icon, navStyle

RULES:
- Every screen MUST list exact elements with props
- Use 3+ premium elements per app (glass-card, parallax-hero, stat-card-xl, etc.)
- At least 1 chart per dashboard screen
- At least 2 buttons with navigate actions
- Include image prompts for heroes/banners (1-2 sentences of cinematic art direction)
- Use domain-specific elements: bank-card for fintech, swipe-card for dating, radar-chart for analytics, calendar-strip for scheduling, gauge-chart for dashboards
- Specify entrance animations: pop for heroes, fade-up for lists, scale-in for cards
- Use skeleton + empty-state for loading/empty views
- 6-10 elements per screen minimum

Keep under 800 words. Be EXHAUSTIVELY SPECIFIC — exact element types, exact props, exact data.`,
  },
  frontend_developer: {
    role: "frontend_developer",
    name: "Frontend Mobile Developer",
    short: "Builds the mobile UI in React Native / Flutter from the design.",
    tasks: ["Tech stack", "Component plan", "Navigation", "State"],
    system:
      `You are a senior mobile developer. Given the designer's element-level specs, produce:

1. **Component Architecture**: map each screen to its element composition, confirming the designer's element choices are technically sound
2. **Reusable Components**: identify 3-5 repeated element patterns that should be extracted into the schema's \`components\` map (e.g., a "transaction-row" component used across screens)
3. **State & Navigation**: navigation type confirmation, screen-to-screen flows with action types (navigate, sheet, dialog)
4. **Conditional Visibility**: identify elements that should use \`visible\` prop for conditional display
5. **Screen Backgrounds**: recommend which screens benefit from gradient/image backgrounds vs default
6. **Performance Notes**: which screens need skeleton loading states, which elements should lazy-load

Reference the designer's exact element choices. Under 400 words.`,
  },
  backend_developer: {
    role: "backend_developer",
    name: "Backend Developer",
    short: "Designs auth, storage, business-logic edge functions.",
    tasks: ["Auth", "Storage", "Edge functions", "Business logic"],
    system:
      `You are a senior Backend engineer designing a Supabase backend.
Output ONLY valid JSON (no markdown, no prose) matching this exact shape — the apply pipeline parses it:

{
  "auth": {
    "providers": ["email", "google", "apple", "github"],   // pick what the app actually needs
    "requireEmailConfirm": true,
    "notes": "1 short line on auth flow"
  },
  "storage": [
    { "bucket": "user-uploads", "public": false, "fileSizeLimit": 10485760, "allowedMimeTypes": ["image/png","image/jpeg","image/webp"] }
  ],
  "edge_functions": [
    {
      "name": "<kebab-case-slug>",
      "description": "1 sentence",
      "verifyJwt": true,
      "envVars": ["STRIPE_KEY"],
      "code": "import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';\\nserve(async (req) => {\\n  // … handler …\\n  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });\\n});"
    }
  ],
  "push": false
}

Rules:
- Only emit edge_functions for logic that MUST run server-side: webhooks, third-party API calls, credentials, scheduled work. Anything RLS + tables can handle, leave to tables.
- Storage buckets must have explicit fileSizeLimit and allowedMimeTypes — never accept "any".
- Edge function code must be a single self-contained Deno module that exports a request handler via Deno.serve or std/http serve. No npm: imports, no \`node:\` imports — only HTTPS Deno deps or Supabase's bundled \`@supabase/supabase-js\`.
- Maximum 4 edge functions, maximum 6 storage buckets.
- Return ONLY JSON. No code fences, no commentary.`,
  },
  database_architect: {
    role: "database_architect",
    name: "Database Architect",
    short: "Designs tables, RLS, FKs, indexes, Postgres functions.",
    tasks: ["Tables", "RLS", "Indexes", "Functions"],
    system:
      `You are a senior Database Architect designing a Supabase backend.
Output ONLY valid JSON (no markdown, no prose) matching this exact shape — the apply pipeline parses it:

{
  "tables": [
    {
      "name": "snake_case_plural",
      "rls": "owner" | "public_read" | "none",
      "columns": [
        {
          "name": "snake_case",
          "type": "text" | "int" | "float" | "bool" | "timestamp" | "jsonb" | "uuid",
          "nullable": true | false,
          "default": "now()" | "gen_random_uuid()" | "auth.uid()" | "true" | "false" | "null" | numeric | "'literal string'",
          "unique": true,
          "references": { "table": "other_table", "column": "id", "onDelete": "cascade" | "restrict" | "set null" | "no action" }
        }
      ],
      "indexes": [
        { "columns": ["col_a", "col_b"], "unique": true }
      ]
    }
  ],
  "functions": [
    {
      "name": "snake_case",
      "args": "user_id uuid, increment_by int DEFAULT 1",
      "returns": "int",
      "securityDefiner": false,
      "description": "1 sentence",
      "body": "DECLARE current_streak int; BEGIN SELECT streak INTO current_streak FROM public.profiles WHERE id = user_id; RETURN current_streak + increment_by; END;"
    }
  ]
}

Rules:
- Default rls to "owner" unless the data is clearly a public catalog (then "public_read").
- DO NOT include id, user_id, created_at, updated_at — those are auto-added.
- Every FK-style column ("<other>_id uuid") MUST include a "references" block. Targets must be another table in this spec.
- Add "indexes" only for columns a screen sorts/filters by. FK columns and user_id are auto-indexed.
- For "default", allowed: now(), gen_random_uuid(), auth.uid(), numeric/boolean/null literals, simple single-quoted strings.
- Postgres functions: SQL injection-safe (no string concat from user input); use SECURITY INVOKER by default; \`securityDefiner: true\` only when the function legitimately needs elevated privileges. The body is plpgsql, will be wrapped server-side with \`LANGUAGE plpgsql SET search_path = public AS $$ … $$\`.
- Maximum 8 tables, 12 columns per table, 4 functions.
- Return ONLY JSON. No code fences, no commentary.`,
  },
  ai_ml: {
    role: "ai_ml",
    name: "AI/ML Engineer",
    short: "Adds AI features, prompts, models and safety logic.",
    tasks: ["AI features", "Model choice", "Prompt design", "Safety"],
    system:
      "You are a senior AI/ML engineer. Output: which AI features make sense for this app, recommended model(s), prompt design sketches, response formatting, and safety/guardrails. Markdown, under 350 words.",
  },
  qa_testing: {
    role: "qa_testing",
    name: "QA Testing",
    short: "Writes test cases, finds bugs and validates flows.",
    tasks: ["Test plan", "Test cases", "Edge cases", "Bug report"],
    system:
      "You are a senior QA engineer. Output: test plan, 8-12 concrete test cases as a markdown table (id | flow | steps | expected), key edge cases, and a sample bug report. Under 450 words.",
  },
  security: {
    role: "security",
    name: "Security",
    short: "Reviews auth, data privacy and API security.",
    tasks: ["Auth review", "Data privacy", "API security", "Vulnerabilities"],
    system:
      "You are a senior Application Security engineer. Output: auth review, data privacy notes, API hardening checklist, common vulnerabilities to watch for in this app, and concrete remediations. Markdown, under 350 words.",
  },
  devops: {
    role: "devops",
    name: "DevOps",
    short: "Prepares deployment, CI/CD and env config.",
    tasks: ["Hosting", "CI/CD", "Env vars", "Release"],
    system:
      "You are a senior DevOps engineer. Output: recommended hosting for backend + mobile distribution, CI/CD pipeline steps, environment variable list, and an app-store release checklist. Markdown, under 350 words.",
  },
  performance: {
    role: "performance",
    name: "Performance",
    short: "Optimizes assets, bundles and network usage.",
    tasks: ["Bundle", "Assets", "Network", "Runtime"],
    system:
      "You are a senior Performance engineer for mobile apps. Output: bundle size strategy, asset/image strategy, network optimizations, runtime/perf tips, and 5 specific metrics to track. Markdown, under 300 words.",
  },
  documentation: {
    role: "documentation",
    name: "Documentation",
    short: "Writes product, technical and user docs.",
    tasks: ["Product docs", "Tech docs", "Setup", "Release notes"],
    system:
      "You are a senior Technical Writer. Output: outline for product docs, technical architecture doc outline, a Quickstart setup section, and example release notes. Markdown, under 350 words.",
  },
  scrum_master: {
    role: "scrum_master",
    name: "Project Manager",
    short: "Breaks work into tasks, tracks progress and timeline.",
    tasks: ["Backlog", "Sprint plan", "Timeline", "Status"],
    system:
      "You are a senior Scrum Master. Output: a prioritized backlog (10-15 items), a 2-sprint plan, a realistic timeline in weeks, and a status report template. Markdown, under 400 words.",
  },
  error_detector: {
    role: "error_detector",
    name: "Error Detector",
    short: "Scans generated code for runtime errors and auto-fixes them.",
    tasks: ["Runtime scan", "Fix errors", "Validate DOM", "Type check"],
    system:
      "You are a schema validation specialist for mobile app JSON schemas. You validate that generated app schemas use correct element types, have valid props, proper navigation references, and follow premium design rules. You auto-fix common issues like missing required props, invalid element types, and broken screen references.",
  },
  summary_agent: {
    role: "summary_agent",
    name: "Summary Agent",
    short: "Produces a build completion summary with status and next steps.",
    tasks: ["Build summary", "Status report", "Next steps", "Changelog"],
    system:
      `You are a build summary specialist. After all agents complete, produce:
1. **What was built**: app name, screen count, element count, key features
2. **Design highlights**: premium elements used, theme summary, navigation type
3. **Quality score**: rate the app on 5 dimensions (visual polish, data density, interactivity, navigation, consistency) out of 10
4. **Improvements**: 3 specific suggestions for the next iteration

Under 200 words.`,
  },
};

export const ALL_ROLES: AgentRole[] = Object.keys(AGENTS) as AgentRole[];

export const AGENT_TEMPLATES: Record<AgentRole, string[]> = {
  product_manager: [
    "Draft a 1-sentence pitch and target personas for this app",
    "Generate an MVP feature list with out-of-scope items",
    "Propose a 4-step roadmap to v1",
  ],
  business_analyst: [
    "Turn the MVP into 8 user stories with acceptance criteria",
    "Recommend a monetization model with 3 alternatives",
    "List 5 business goals and KPIs for launch",
  ],
  ux_researcher: [
    "Map the primary user journey end-to-end",
    "Identify the top 3 pain points and fixes",
    "Design an onboarding flow with accessibility notes",
  ],
  ui_ux_designer: [
    "Propose a screen list with 1-line purpose each",
    "Generate a color palette and typography scale",
    "List a reusable component library for this app",
  ],
  frontend_developer: [
    "Recommend a React Native tech stack and navigation",
    "Map screens to components and state",
    "Write the Home screen component",
  ],
  backend_developer: [
    "Design the server architecture and REST endpoints",
    "Choose an auth approach and outline flows",
    "Sketch the core business logic services",
  ],
  database_architect: [
    "Design the Postgres schema with keys and indexes",
    "Propose migrations for v1",
    "Add notes on scalability and partitioning",
  ],
  ai_ml: [
    "List AI features that fit this app",
    "Recommend models and prompt designs",
    "Add safety guardrails and evaluation plan",
  ],
  qa_testing: [
    "Write a test plan with 10 concrete cases",
    "List edge cases for the critical flow",
    "Draft a sample bug report",
  ],
  security: [
    "Review auth and session handling",
    "Produce an API hardening checklist",
    "List top vulnerabilities and remediations",
  ],
  devops: [
    "Recommend hosting and CI/CD pipeline",
    "List required environment variables",
    "Draft an app-store release checklist",
  ],
  performance: [
    "Propose a bundle and asset strategy",
    "Suggest network and runtime optimizations",
    "List 5 perf metrics to track",
  ],
  documentation: [
    "Outline product docs and quickstart",
    "Outline a technical architecture doc",
    "Draft example release notes",
  ],
  scrum_master: [
    "Generate a prioritized backlog (10-15 items)",
    "Plan the first 2 sprints",
    "Estimate a realistic timeline in weeks",
  ],
  error_detector: [
    "Scan the generated app for runtime errors",
    "Check for invalid React DOM properties",
    "Validate all component props and types",
  ],
  summary_agent: [
    "Generate a build completion summary",
    "List what was built and any issues found",
    "Recommend next steps for the app",
  ],
};

export const COMPLEXITY_PRESETS: Record<string, AgentRole[]> = {
  simple: ["product_manager", "ui_ux_designer", "frontend_developer", "qa_testing"],
  standard: [
    "product_manager",
    "business_analyst",
    "ui_ux_designer",
    "frontend_developer",
    "backend_developer",
    "database_architect",
    "qa_testing",
    "security",
  ],
  ai_powered: [
    "product_manager",
    "business_analyst",
    "ux_researcher",
    "ui_ux_designer",
    "frontend_developer",
    "backend_developer",
    "database_architect",
    "ai_ml",
    "qa_testing",
    "security",
    "devops",
    "documentation",
    "error_detector",
    "summary_agent",
  ],
  enterprise: ALL_ROLES,
};

// ---------------------------------------------------------------------------
// Visual badges for team chat (avatar emoji + tailwind tint)
// ---------------------------------------------------------------------------
export const AGENT_BADGE: Record<AgentRole, { emoji: string; tint: string }> = {
  product_manager:    { emoji: "📋", tint: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  business_analyst:   { emoji: "📊", tint: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  scrum_master:       { emoji: "🏃", tint: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  ux_researcher:      { emoji: "🔍", tint: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30" },
  ui_ux_designer:     { emoji: "🎨", tint: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
  frontend_developer: { emoji: "💻", tint: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  backend_developer:  { emoji: "⚙️", tint: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  database_architect: { emoji: "🗄️", tint: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  ai_ml:              { emoji: "🧠", tint: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  qa_testing:         { emoji: "🧪", tint: "bg-lime-500/15 text-lime-400 border-lime-500/30" },
  security:           { emoji: "🛡️", tint: "bg-red-500/15 text-red-400 border-red-500/30" },
  error_detector:     { emoji: "🐞", tint: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  devops:             { emoji: "🚀", tint: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" },
  performance:        { emoji: "⚡", tint: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  documentation:      { emoji: "📚", tint: "bg-teal-500/15 text-teal-400 border-teal-500/30" },
  summary_agent:      { emoji: "✅", tint: "bg-green-500/15 text-green-400 border-green-500/30" },
};

/** Strip the leading `<!--agent:role-->` marker and return role + clean text. */
export function parseAgentMarker(content: string): { role: AgentRole | null; text: string } {
  const m = content.match(/^<!--agent:([a-z_]+)-->\n?/);
  if (!m) return { role: null, text: content };
  const role = m[1] as AgentRole;
  if (!(role in AGENTS)) return { role: null, text: content };
  return { role, text: content.slice(m[0].length) };
}
