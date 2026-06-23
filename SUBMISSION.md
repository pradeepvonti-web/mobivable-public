# Mobivable — AI Mobile App Creation Platform

> Chat your idea into a real, shippable iOS & Android app.

🌐 **Live (Google Cloud Run):** https://mobivable-776377998065.us-central1.run.app

## Problem to solve

Building a mobile app today requires many skills — UI design, frontend development, backend setup, testing, **producing real native binaries**, and app store submission. Founders, small businesses, students, and non-technical users have good ideas but cannot turn them into working, **shippable** iOS and Android apps. The hardest part isn't a pretty preview — it's a real, compiling app that runs on a device and reaches the stores.

## Our solution

Mobivable is an AI-powered mobile app platform that turns a plain-English idea into a **real, running React Native / Expo app** through chat. It generates screens and user flows, **writes and verifies actual Expo source code in a live sandbox**, auto-wires a Supabase backend, previews the app **on your real phone via a QR code**, and produces **deployment-ready native binaries (APK/IPA/AAB)** with one-click store submission. A **Template Vault** lets users start from a ready-made, instantly-rendered app — credit-free — and customize from there.

## How AI Agents are used

Mobivable is built on **Google's Agent Development Kit (ADK)** — a multi-agent system deployed as a dedicated Cloud Run microservice. The architecture showcases ADK's advanced orchestration features:

### Multi-Agent Architecture (Google ADK)

```
🤖 mobivable_agent (root — gemini-2.5-flash)
├── 🎨 studio_agent (full-featured editor — gemini-2.5-pro)
│   └── callbacks: guardrails + audit logging
│
├── ⚡ build_pipeline (SequentialAgent — deterministic)
│   ├── 1. research_agent → Domain research + design brief
│   ├── 2. design_agent → Mockup analysis + design system
│   ├── 3. build_agent → Write Expo source files in E2B sandbox
│   ├── 4. verify_loop (LoopAgent — self-healing, max 5 cycles)
│   │   ├── typecheck_agent → Run tsc + lint
│   │   └── fix_agent → Fix errors automatically
│   └── 5. preview_agent → Launch live preview
│
└── 🎭 design_explorer (ParallelAgent — concurrent)
    ├── dark_designer → Dark theme variant
    └── light_designer → Light theme variant
```

### ADK Features Used

| ADK Feature | How We Use It |
|---|---|
| **`SequentialAgent`** | Deterministic 5-stage build pipeline: Research → Design → Build → Verify → Preview |
| **`LoopAgent`** | Self-healing type-check → fix cycle that auto-corrects TypeScript errors (max 5 iterations) |
| **`ParallelAgent`** | Concurrent dark/light design variant generation for user comparison |
| **`before_model_callback`** | Guardrails that detect demo users and inject context before every LLM call |
| **`before_tool_callback`** | Blocks destructive tools (delete, EAS build) for demo accounts |
| **`after_tool_callback`** | Audit logging — tracks tool calls, build phase transitions, call counts |
| **Session State** | Persists `user_email`, `build_phase`, `tool_call_count` across conversation turns |
| **Sub-agent Delegation** | Root agent routes to specialized sub-agents based on user intent |

### Agent Roles

- **MCP Agent (root)** — cross-project orchestration, routes to specialized sub-agents
- **Studio Agent** — full-featured per-project editor with 25+ MCP tools
- **Research Agent** — domain research, competitive analysis, design brief generation
- **Design Agent** — vision-reads the approved mockup, establishes pixel-level design system
- **Build Agent** — writes actual Expo/React Native files in an E2B sandbox
- **Type-Check Agent** — runs `bunx tsc --noEmit` and `bun run lint`, reports errors
- **Fix Agent** — reads type errors, applies surgical file edits to fix them
- **Preview Agent** — launches the live Expo-web preview for the device frame
- **Dark/Light Designers** — generate concurrent design variants via ParallelAgent

## Technologies used

- **Claude Opus 4.8 (planning/strong) + Sonnet 4.6 (fast/execution)** — primary build brain, with heavy planning on Opus and the many build iterations on cheaper Sonnet.
- **Gemini 2.5 Flash & Pro + Vertex AI (Imagen 4.0)** — configurable provider and GCP fallback (JWT service-account auth, in-memory token caching).
- **Nano Banana (Gemini Flash Image)** — AI mockups and in-app assets, **decoupled from the text brain** so mockups work regardless of which LLM is driving the build.
- **Real build engine** — **E2B persistent sandboxes**, **Expo SDK 54 / React Native 0.81 / expo-router 6**, bun, with a `tsc` + `eslint` verify loop; generated files mirrored to Supabase.
- **Device preview** — **Expo Go via an ngrok tunnel** (camera, location, notifications, true native behavior on a real phone) **plus a sandbox-free "Instant" in-browser schema renderer** for zero-infra previews.
- **Native deploy** — **EAS Build** (cloud IPA/APK/AAB across `preview`/`production`/`development` profiles), **EAS Submit** (store submission), **EAS Update** (OTA), with scaffolded native modules: camera, location, notifications, image-picker, secure-store, `react-native-svg`, `expo-linear-gradient`, QR.
- **MCP (Model Context Protocol)** — custom server with **25+ atomic tools** including real workspace tools (`ws_write_file` / `ws_read_file` / `ws_edit_file` / `ws_run_command`), `read_mockup` (vision), and backend provisioning, enabling agentic tool-use loops with auto-verify.
- **Resilience** — retry-with-backoff on transient AI network drops, and automatic recovery of expired sandboxes.
- **Hosting** — primary on Google **Cloud Run + Cloud Build** (serverless containers, auto-scaling 0–10 instances, CI/CD) — live at `mobivable-776377998065.us-central1.run.app`; also deployable to **Cloudflare Workers via Lovable Publish**. Backend on **Supabase (PostgreSQL + Auth + Storage)**.
- **TanStack Start (React SSR), Radix UI, TailwindCSS v4, GSAP, Monaco Editor.**
- **Multi-provider fallback chain:** Anthropic, Gemini/Vertex, OpenAI, Groq, OpenRouter, Ollama (configurable; Anthropic preferred when keyed, GCP path otherwise).

## Data sources

- **User prompts** — app concepts, features, and design preferences.
- **Supabase PostgreSQL** — project schemas (JSON), chat history, AI credits, thread persistence, per-app backend specs.
- **Supabase Storage** — AI-generated assets with SHA-256 content-addressed caching.
- **E2B sandbox filesystem** — the real generated Expo project per app, mirrored to Postgres for durability/resume.
- **Template Vault** — a taxonomy of **~40 categories × ~300 archetypes × theme variants → ~2,000 ready-to-use templates**, each stored as a renderable schema for **instant, credit-free instantiation** (beyond the 10 seeded design recipes: Fintech, Fitness, E-Commerce, Social, Food, Education, Travel, Productivity, Healthcare, Music).
- **Google Fonts API** — 30 curated font families for live preview.
- **Domain Knowledge Base** — user-uploaded text/URLs ingested via MCP.

## Findings and learnings

- **Real code beats guidance.** Shipping a true autonomous build agent (writes/edits files, `tsc`/`eslint` loop, fixes its own errors) is the difference between "looks like an app" and "is a runnable app."
- **Plan-first yields 3–5× better results.** Two-pass architecture (fast model → brief → strong model → build) dramatically outperforms direct prompt-to-code.
- **Mockup fidelity is a tooling + review problem.** Builds were flattening designs because the scaffold lacked primitives — adding real charts/gradients/QR libs **plus a self-review pass that diffs the build against the mockup** closed the gap.
- **Decouple image generation from the text brain.** A brain without an image model silently kills mockups; routing images independently fixed it.
- **Pin the SDK to Expo Go's.** Expo Go only runs the latest SDK, so the scaffold must track it (SDK 54) or device preview red-screens — and the build must align native versions (`expo install --fix`).
- **Resilience is a feature at agent scale.** Transient network drops killed long builds → retry-with-backoff; expired sandboxes → auto-recovery; tunnels for cloud-Metro device previews.
- **Templates slash AI cost.** A vault of pre-rendered apps makes most app creation **credit-free**, reserving AI spend for genuine custom changes.
- **Two previews beat one.** A sandbox-free "Instant" schema→UI renderer gives instant, reliable previews; the heavyweight Expo sandbox preview is reserved for true native testing.
- **Surgical MCP tools > monolithic ones.** 25+ atomic tools let the AI compose complex edits while auto-verify catches mistakes.
- **Design consistency is a pipeline problem.** Persisting one brief in the DB and reusing it throughout fixed mockup ≠ app drift.
- **Silent agentic failures are the #1 usability killer.** Tools failing without errors leave users watching infinite spinners; explicit error surfacing at every boundary was essential.

## Third-party integrations

- **Supabase** — PostgreSQL, auth, storage (self-hosted project, MIT SDK) ✅
- **Anthropic Claude** — primary build brain (user/managed API key; not stored or redistributed) ✅
- **Google Gemini / Vertex AI** — API key + GCP service account (Google Cloud ToS) ✅
- **E2B** — secure cloud sandboxes for the real build engine (API key) ✅
- **Expo / EAS** — cloud native builds, store submission, OTA updates (Expo access token) ✅
- **Google Cloud Run & Cloud Build** — primary hosting + CI/CD on GCP (Google Cloud ToS) ✅
- **Cloudflare Workers (via Lovable Publish)** — additional hosting path ✅
- **Google Fonts** — SIL Open Font License / Apache 2.0 ✅
- **Paddle + Stripe** — payment processing (merchant accounts) ✅
- **Adapty / RevenueCat / Google AdMob** — optional in-app monetization for generated apps (user keys) ✅
- **Radix UI, TanStack, Lucide Icons** — MIT/ISC open-source ✅
- **GSAP** — GreenSock license ✅
- **Monaco Editor** — MIT (Microsoft) ✅
- **Optional: OpenAI, Groq, OpenRouter, Ollama** — users bring their own API keys; Mobivable does not store or redistribute third-party credentials ✅
