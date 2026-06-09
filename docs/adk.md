# Mobivable ADK Agent Service

Google Agent Development Kit (ADK) microservice that orchestrates
Mobivable's multi-agent system. Deployed as a second Cloud Run service
alongside the main Node.js app.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│          ADK Agent Service (Cloud Run)                │
│          Python 3.12 + FastAPI                        │
│                                                       │
│  ┌───────────────┐    ┌───────────────────────────┐  │
│  │  root_agent   │    │    studio_agent            │  │
│  │  (MCP Agent)  │───▶│    (Studio Agent)          │  │
│  │               │    │                             │  │
│  │ gemini-flash  │    │  gemini-pro                 │  │
│  │ Routing &     │    │  Design & build workflow    │  │
│  │ knowledge     │    │  Schema gen & surgical edits│  │
│  └───────┬───────┘    └─────────┬─────────────────┘  │
│          │                      │                     │
│          └──────────┬───────────┘                     │
│                     │                                 │
│  ┌──────────────────▼────────────────────────────┐   │
│  │          ADK Tool Wrappers (tools.py)          │   │
│  │        20+ async functions → HTTP bridge       │   │
│  └──────────────────┬────────────────────────────┘   │
│                     │ HTTP POST                       │
└─────────────────────┼────────────────────────────────┘
                      ▼
┌──────────────────────────────────────────────────────┐
│       Mobivable Node.js Server (Cloud Run)            │
│       POST /api/public/mcp (JSON-RPC)                 │
│                                                       │
│       25+ MCP tools: research_and_plan,               │
│       generate_app, verify_schema, etc.               │
└──────────────────────────────────────────────────────┘
```

## Key Components

### `agent.py` — Agent Definitions

Two agents in a parent→child hierarchy:

| Agent | Model | Role |
|-------|-------|------|
| **root_agent** (MCP Agent) | `gemini-2.5-flash` | Cross-project routing, project management, knowledge base |
| **studio_agent** (Studio Agent) | `gemini-2.5-pro` | Per-project design, plan-first workflow, surgical edits, code gen |

The root agent delegates design/build tasks to the studio agent using
ADK's native `sub_agents` mechanism.

### `tools.py` — MCP Tool Bridge

Each tool is an async Python function with a proper docstring (which ADK
uses as the tool description for the LLM). Tools call the Node.js MCP
server's JSON-RPC endpoint via HTTP:

```python
async def research_and_plan(project_id: str, prompt: str) -> dict:
    """Research the domain and create a design plan with AI mockup."""
    return await _call_mcp_tool("research_and_plan", {
        "project_id": project_id,
        "prompt": prompt,
    })
```

**Why bridge instead of re-implement?** The MCP tools contain substantial
business logic (schema validation, Supabase mutations, image pipelines).
Bridging keeps a single source of truth in TypeScript and avoids
duplicating auth, RLS, and storage logic.

### `server.py` — HTTP Server

FastAPI server with three endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Cloud Run health check |
| `/run` | POST | Single agent turn (non-streaming) |
| `/run/stream` | POST | Single agent turn (SSE streaming) |

The streaming endpoint emits Server-Sent Events:

```
data: {"type": "delta", "text": "Let me research..."}
data: {"type": "tool_start", "name": "research_and_plan", "args": {...}}
data: {"type": "tool_result", "name": "research_and_plan", "result": "..."}
data: {"type": "delta", "text": "I've created a design plan..."}
data: {"type": "done", "session_id": "abc-123"}
```

## How the Node.js App Connects

In `mcp-agent.functions.ts` (section 2.5), when `ADK_AGENT_URL` is set:

1. The agent turn handler sends the user message to `POST /run/stream`
2. SSE events are parsed and forwarded to the frontend in real-time
3. Tool calls appear in the chat UI as collapsible cards
4. The final assistant response is persisted to `mcp_agent_messages`

When `ADK_AGENT_URL` is not set (local dev), the existing TypeScript
tool-use loop handles orchestration directly.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Yes | — | GCP project ID for Vertex AI |
| `GOOGLE_CLOUD_LOCATION` | Yes | `us-central1` | Vertex AI region |
| `MOBIVABLE_MCP_URL` | Yes | `http://localhost:3000/api/public/mcp` | Node.js MCP endpoint |
| `MCP_SERVICE_TOKEN` | No | — | Service-to-service auth token |
| `ADK_FAST_MODEL` | No | `gemini-2.5-flash` | Model for root agent |
| `ADK_STRONG_MODEL` | No | `gemini-2.5-pro` | Model for studio agent |
| `PORT` | No | `8081` | Server port |
| `LOG_LEVEL` | No | `INFO` | Python logging level |

## Local Development

```bash
# 1. Create virtual environment
cd adk-agent
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # macOS/Linux

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment
cp .env.example .env
# Edit .env with your GCP project and MCP URL

# 4. Start the server
python server.py
# → 🚀 Mobivable ADK Agent Service starting on port 8081

# 5. Test the health endpoint
curl http://localhost:8081/health

# 6. Run an agent turn
curl -X POST http://localhost:8081/run \
  -H "Content-Type: application/json" \
  -d '{"prompt": "List my projects", "session_id": "test-123"}'
```

## Deployment

### Deploy via Cloud Build

```bash
cd adk-agent
gcloud builds submit --config cloudbuild-adk.yaml .
```

This builds the Docker image and deploys to Cloud Run as `mobivable-adk`.

### Deploy manually

```bash
cd adk-agent
gcloud run deploy mobivable-adk \
  --source . \
  --region us-central1 \
  --platform managed \
  --no-allow-unauthenticated \
  --memory 1Gi \
  --port 8081
```

### Connect to main app

After deploying, set the ADK URL on the main Mobivable service:

```bash
ADK_URL=$(gcloud run services describe mobivable-adk \
  --region us-central1 --format 'value(status.url)')

gcloud run services update mobivable \
  --region us-central1 \
  --set-env-vars "ADK_AGENT_URL=$ADK_URL"
```

## Security

- The ADK service runs with `--no-allow-unauthenticated` — only the
  main Mobivable service (via Cloud Run service-to-service auth) can
  call it.
- Vertex AI credentials are provided automatically by the Cloud Run
  service account (no API keys needed).
- The `MCP_SERVICE_TOKEN` adds an extra layer of auth for the MCP
  bridge calls.

## ADK Concepts Used

| ADK Concept | How We Use It |
|-------------|---------------|
| **Agent** | Two `Agent` instances with specialized instructions and tool sets |
| **Sub-agents** | `studio_agent` is a sub-agent of `root_agent` |
| **Tools** | 20+ async function tools with typed parameters and docstrings |
| **Runner** | `Runner.run_async()` manages the tool-use loop and model calls |
| **SessionService** | `InMemorySessionService` for multi-turn conversation state |
| **Model selection** | Fast model for routing, strong model for building |
