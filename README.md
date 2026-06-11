# 🚀 Mobivable — AI Agent for Mobile App Creation

**Chat. Ship. Dominate.**

Mobivable is an AI-powered mobile app studio that turns natural language into **real, shippable** iOS & Android apps. A multi-agent system (Claude Opus 4.8 / Sonnet 4.6 primary brain, with Gemini & Vertex AI fallback) writes and verifies actual **Expo / React Native** code in a live sandbox, previews it on a real phone, and produces native binaries for the stores. Built on **Google Cloud** with **Vertex AI**, **Agent Development Kit (ADK)**, **Model Context Protocol (MCP)**, and **E2B** sandboxes.

🌐 **Live**: [mobivable-776377998065.us-central1.run.app](https://mobivable-776377998065.us-central1.run.app)

---

## ✨ What It Does

Describe your app idea in plain English → Mobivable's AI agent researches, designs, builds, and deploys a premium mobile app — all through conversation.

```
You: "Build a fitness tracker with workout logging and progress charts"

Studio Agent:
  🔬 Researching fitness app patterns...
  📋 Design plan created with 5 screens
  🎨 Generating mockup...
  ✅ Ready for review — approve to build!

You: "Approve"

Studio Agent:
  🤖 Generating app schema...
  ✅ Verifying screens...
  🖼️ Generating app assets...
  → Live preview ready!
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Mobivable Studio                       │
│              (TanStack Start + React)                    │
│         Cloud Run: mobivable-*.run.app                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  User Chat ──→ sendProjectMessage()                      │
│                    │                                     │
│                    ├── ADK_AGENT_URL set?                 │
│                    │   YES → POST /run/stream (SSE)      │
│                    │   NO  → TypeScript tool loop         │
│                    │                                     │
│                    ▼                                     │
│  ┌────────────────────────────────────┐                  │
│  │     ADK Agent Service             │                  │
│  │     Cloud Run: mobivable-adk      │                  │
│  │                                   │                  │
│  │  ┌─────────────────────────┐      │                  │
│  │  │ MCP Agent (Router)      │      │                  │
│  │  │ gemini-2.5-flash        │      │                  │
│  │  │ - Project management    │      │                  │
│  │  │ - Knowledge base        │      │                  │
│  │  └──────────┬──────────────┘      │                  │
│  │             │ delegates           │                  │
│  │  ┌──────────▼──────────────┐      │                  │
│  │  │ Studio Agent (Builder)  │      │                  │
│  │  │ gemini-2.5-pro          │      │                  │
│  │  │ - Design & plan         │      │                  │
│  │  │ - Build & edit apps     │      │                  │
│  │  │ - Code generation       │      │                  │
│  │  └──────────┬──────────────┘      │                  │
│  │             │ tools               │                  │
│  │  ┌──────────▼──────────────┐      │                  │
│  │  │ MCP Tool Bridge         │      │                  │
│  │  │ 15+ tools via JSON-RPC  │      │                  │
│  │  └─────────────────────────┘      │                  │
│  └────────────────────────────────────┘                  │
│                                                          │
│  Supabase (Auth, DB, Storage, RLS)                       │
│  Vertex AI (Gemini 2.5 Flash + Pro)                      │
└──────────────────────────────────────────────────────────┘
```

---

## 🤖 Google ADK Integration

Mobivable uses [Google's Agent Development Kit (ADK)](https://google.github.io/adk-docs/) for AI agent orchestration. The ADK service runs as a separate Cloud Run microservice.

### Multi-Agent System

| Agent | Model | Role |
|-------|-------|------|
| **MCP Agent** (root) | `gemini-2.5-flash` | Routes requests, manages projects, delegates to sub-agents |
| **Studio Agent** (sub) | `gemini-2.5-pro` | Designs and builds apps with plan-first workflow |

### Agent Tools (via MCP)

| Category | Tools |
|----------|-------|
| **Read** | `list_projects`, `get_project`, `list_screens`, `get_screen`, `get_chat_history` |
| **Plan-First** | `research_and_plan`, `generate_app` |
| **Surgical Edits** | `update_screen`, `add_element`, `update_element`, `remove_element` |
| **Styling** | `update_theme`, `update_navigation` |
| **Code** | `generate_code`, `export_project_code` |
| **Verification** | `verify_schema` |
| **Knowledge** | `list_knowledge_items`, `add_knowledge_item` |

### Plan-First Workflow

```
1. User describes app idea
2. Agent calls research_and_plan → design brief + mockup
3. User reviews and approves (or requests changes)
4. Agent builds a REAL Expo app in a sandbox (see below)
5. Live Expo-web preview rendered in Studio
```

---

## 🧱 Real Expo Build Engine

After a mockup is approved, the Studio Agent builds a **real Expo / React Native app** in a
per-project [E2B](https://e2b.dev) sandbox — not a templated schema. It has actual file and
shell tools and an iterate-until-clean loop:

| Tool | Purpose |
|------|---------|
| `ws_write_file` / `ws_read_file` / `ws_edit_file` / `ws_list_files` | Author the app's screens, stores, and components |
| `ws_run_command` (+ async variant) | `bun install`, `bunx tsc --noEmit`, `bun run lint`, `expo export -p web` |
| `read_mockup` | Vision-reads the approved mockup as the pixel-level source of truth |
| `ws_start_preview` | Serves the compiled Expo-web build for the live preview |

**Mockup fidelity is the headline feature.** The scaffold ships the visual primitives needed to
*reproduce* a design rather than flatten it — `react-native-svg` (donut/line/bar charts),
`expo-linear-gradient` (gradient surfaces), and `react-native-qrcode-svg`. The build prompt
requires every screen, the exact app name, the bottom tab bar, and real charts/gradients; a
mandatory **fidelity self-review pass** re-reads the mockup and fixes divergences before finishing.

**Pluggable brain.** The build can run on Anthropic Claude (Opus 4.8 strong / Sonnet 4.6 fast)
or Gemini/Lovable. Image generation (mockups) is **decoupled** from the text brain, so a brain
without an image model (e.g. Claude) still gets mockups via an image-capable provider. AI calls
are wrapped with transient-network retry so a dropped socket doesn't discard an in-progress build.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React, TanStack Start, TanStack Router |
| **Backend** | Node.js, TanStack Server Functions |
| **AI Orchestration** | Google ADK 2.2.0, Vertex AI · TypeScript tool-use loop (default brain) |
| **AI Models** | Multi-provider brain — Anthropic Claude (Opus 4.8 / Sonnet 4.6 / Haiku 4.5), Gemini 2.5 Pro/Flash, Lovable AI |
| **Tool Protocol** | Model Context Protocol (MCP) via JSON-RPC |
| **Auth & DB** | Supabase (PostgreSQL, Auth, RLS, Storage) |
| **Hosting** | Google Cloud Run (2 services) |
| **Build** | Cloud Build, Docker |
| **Build Engine** | Real Expo build in a per-project [E2B](https://e2b.dev) sandbox (file + bash tools, `tsc`/lint, mockup-fidelity self-review) |
| **App Preview** | Sandbox-free **Instant** in-browser schema renderer + live Expo-web build + **Expo Go on a real phone** (ngrok tunnel QR) |
| **Mobile Stack** | Expo SDK 54 / React Native 0.81 / expo-router 6 · native modules (camera, location, notifications, secure-store) · `react-native-svg`, `expo-linear-gradient` |
| **Native Deploy** | **EAS Build** (APK/IPA/AAB) · **EAS Submit** (store submission) · **EAS Update** (OTA) |
| **Export** | Full Expo (React Native) source, no lock-in |

---

## 📁 Project Structure

```
mobivable/
├── adk-agent/                    # ADK agent microservice (Python)
│   ├── agent.py                  # Agent definitions (root + studio)
│   ├── tools.py                  # MCP tool bridge (JSON-RPC → Node.js)
│   ├── server.py                 # FastAPI server with /run/stream SSE
│   ├── Dockerfile                # Container for Cloud Run
│   └── requirements.txt          # google-adk, fastapi, etc.
├── src/
│   ├── lib/
│   │   ├── project-chat.functions.ts   # Studio chat → build loop (BUILD MODE prompt)
│   │   ├── mcp-agent.functions.ts      # Agent page → ADK routing
│   │   ├── mcp-tools.ts                # MCP tool registry (incl. ws_* + read_mockup)
│   │   ├── ai-provider.ts              # Multi-provider AI + image-gen + retry
│   │   ├── agent-workspace.server.ts   # Per-project E2B sandbox lifecycle
│   │   ├── expo-scaffold.ts            # Expo Router scaffold (+ viz libs)
│   │   └── agents.ts                   # Agent role definitions
│   ├── routes/
│   │   ├── projects.$projectId.tsx     # Studio workspace (4500+ lines)
│   │   ├── agent.tsx                   # Agent page
│   │   ├── dashboard.tsx               # Project dashboard
│   │   └── api/public/mcp.ts          # MCP JSON-RPC endpoint
│   └── components/                     # 50+ UI components
├── docs/
│   ├── adk.md                          # ADK integration docs
│   └── mcp.md                          # MCP protocol docs
├── supabase/                           # Database migrations & RLS
├── tests/                              # Playwright E2E tests
├── Dockerfile                          # Main service container
├── cloudbuild.yaml                     # Main service CI/CD
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Python 3.11+ (for ADK agent)
- Google Cloud account with Vertex AI enabled
- Supabase project

### Environment Variables

```bash
# Main service
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADK_AGENT_URL=https://your-adk-service.run.app  # Optional: enables ADK routing
MCP_INTERNAL_TOKEN=your-random-token              # For ADK ↔ MCP auth

# ADK service
GOOGLE_CLOUD_PROJECT=your-gcp-project
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_GENAI_USE_VERTEXAI=true
MOBIVABLE_MCP_URL=https://your-main-service.run.app/api/public/mcp
MCP_SERVICE_TOKEN=same-as-MCP_INTERNAL_TOKEN
ADK_FAST_MODEL=gemini-2.5-flash
ADK_STRONG_MODEL=gemini-2.5-pro
```

### Local Development

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# (Optional) Start ADK agent locally
cd adk-agent
pip install -r requirements.txt
python server.py
```

### Deploy to Google Cloud

```bash
# Deploy ADK agent
cd adk-agent
gcloud run deploy mobivable-adk --source . --region us-central1 \
  --no-allow-unauthenticated --memory 1Gi --port 8081

# Deploy main service
gcloud run deploy mobivable --source . --region us-central1 \
  --allow-unauthenticated --memory 1Gi --port 8080 \
  --set-env-vars "ADK_AGENT_URL=https://mobivable-adk-*.run.app"

# Grant service-to-service auth
gcloud run services add-iam-policy-binding mobivable-adk \
  --member="serviceAccount:YOUR-COMPUTE-SA@developer.gserviceaccount.com" \
  --role="roles/run.invoker" --region us-central1
```

---

## 🔑 Key Features

- **🤖 AI Agent Studio** — Multi-agent system with plan-first workflow
- **🧱 Real Expo Build Engine** — An agent writes a real Expo / React Native app file-by-file in a sandbox, runs `tsc`/lint, and self-reviews against the mockup
- **⚡ Instant Preview (no sandbox)** — In-browser schema renderer for instant, infra-free previews; the live Expo sandbox build is reserved for true native testing
- **📲 Real-Device Preview** — Open the app in **Expo Go** on a real phone via a QR code (ngrok tunnel) — camera, location, notifications all work
- **🚀 Native Deploy** — **EAS Build** (APK/IPA/AAB), **EAS Submit** (store submission), and **EAS Update** (OTA) — ship straight to the App Store / Google Play
- **🗂️ Template Vault** — ~2,000 ready-to-use app templates for instant, **credit-free** starts
- **✏️ Visual Editor** — Drag-and-drop editing with undo/redo
- **📱 Native Export** — Full Expo (React Native) source, no lock-in
- **🔧 MCP Protocol** — 25+ tools; connect from Cursor, Claude Code, or Claude Desktop
- **👥 Real-Time Collaboration** — Multi-user editing with presence
- **🗄️ Backend Provisioning** — Auto-generate Supabase schemas (tables, RLS, auth) for generated apps
- **📊 SDLC Progress** — Track design → build → test → deploy phases
- **🌓 Dark/Light Mode** — Premium glassmorphism UI

---

## 📝 Recent Updates

- **Real Expo build engine** — agentic file/bash build in an E2B sandbox replaces the legacy
  schema→template path (the old `code-from-schema` / Sandpack / Flutter renderers were removed).
- **Mockup-fidelity engine** — scaffold ships `react-native-svg`, `expo-linear-gradient`, and
  `react-native-qrcode-svg`; the build prompt enforces full-screen, exact-name, real-chart
  fidelity, plus a mandatory self-review pass against the mockup.
- **Pluggable Claude brain** — Anthropic Opus 4.8 (strong) / Sonnet 4.6 (fast) / Haiku 4.5,
  selectable alongside Gemini and Lovable AI.
- **Image generation decoupled** from the text brain (`detectImageProvider`), so the Claude
  brain and mockup generation work together.
- **Network-resilient AI calls** — streaming requests retry transient drops instead of failing
  a long build.
- **Expo-only preview** — the device frame now shows the live Expo build; the legacy React and
  Flutter preview tabs were removed.

---

## 📄 License

Proprietary — © 2026 AKSDATA.AI Corp

---

## 🏆 Built for Google for Startups AI Agents Challenge 2026

Built with ❤️ using **Google Cloud**, **Gemini**, **Vertex AI**, and **Agent Development Kit (ADK)**.
