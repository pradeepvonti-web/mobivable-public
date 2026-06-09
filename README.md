# 🚀 Mobivable — AI Agent for Mobile App Creation

**Chat. Ship. Dominate.**

Mobivable is an AI-powered mobile app studio that turns natural language into production-ready mobile apps. Built on **Google Cloud** with **Gemini**, **Vertex AI**, **Agent Development Kit (ADK)**, and **Model Context Protocol (MCP)**.

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
4. Agent calls generate_app → full app schema
5. Agent calls verify_schema → auto-fix issues
6. Live preview rendered in Studio
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React, TanStack Start, TanStack Router |
| **Backend** | Node.js, TanStack Server Functions |
| **AI Orchestration** | Google ADK 2.2.0, Vertex AI |
| **AI Models** | Gemini 2.5 Pro, Gemini 2.5 Flash |
| **Tool Protocol** | Model Context Protocol (MCP) via JSON-RPC |
| **Auth & DB** | Supabase (PostgreSQL, Auth, RLS, Storage) |
| **Hosting** | Google Cloud Run (2 services) |
| **Build** | Cloud Build, Docker |
| **App Preview** | React Native Web renderer, Flutter bridge |
| **Export** | Expo (React Native), Flutter |

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
│   │   ├── project-chat.functions.ts   # Studio chat → ADK routing
│   │   ├── mcp-agent.functions.ts      # Agent page → ADK routing
│   │   ├── mcp-tools.ts                # MCP tool registry (25+ tools)
│   │   ├── ai-provider.ts              # Multi-provider AI (Anthropic/OpenAI/Gemini)
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
- **🎨 Live Preview** — Real-time mobile app preview with device frames
- **✏️ Visual Editor** — Drag-and-drop editing with undo/redo
- **📱 Multi-Platform Export** — Expo (React Native) and Flutter
- **🔧 MCP Protocol** — Connect from Cursor, Claude Code, or Claude Desktop
- **👥 Real-Time Collaboration** — Multi-user editing with presence
- **🗄️ Backend Provisioning** — Auto-generate Supabase schemas
- **📊 SDLC Progress** — Track design → build → test → deploy phases
- **🎯 15+ Agent Tools** — Surgical edits, code gen, verification
- **🌓 Dark/Light Mode** — Premium glassmorphism UI

---

## 📄 License

Proprietary — © 2026 AKSDATA.AI Corp

---

## 🏆 Built for Google for Startups AI Agents Challenge 2026

Built with ❤️ using **Google Cloud**, **Gemini**, **Vertex AI**, and **Agent Development Kit (ADK)**.
