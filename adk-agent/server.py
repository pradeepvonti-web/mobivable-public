"""
Mobivable ADK HTTP Server

Wraps the ADK agent system in a FastAPI server for Cloud Run deployment.
Exposes endpoints for:
  - POST /run          — Run a single agent turn (non-streaming)
  - POST /run/stream   — Run a single agent turn (SSE streaming)
  - GET  /health       — Health check for Cloud Run

The Node.js frontend calls these endpoints when ADK_AGENT_URL is
configured, routing agent orchestration through ADK instead of the
custom TypeScript tool-use loop.
"""

from dotenv import load_dotenv
load_dotenv()

import os
import json
import uuid
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from agent import root_agent

# ── Configuration ─────────────────────────────────────────────────
PORT = int(os.getenv("PORT", "8081"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger("mobivable-adk")

# ── ADK Runner Setup ─────────────────────────────────────────────
# The Runner manages the agent execution loop: model calls, tool
# execution, and multi-turn conversation state.

APP_NAME = "mobivable-adk"
session_service = InMemorySessionService()

runner = Runner(
    agent=root_agent,
    app_name=APP_NAME,
    session_service=session_service,
)


# ── Request/Response Models ──────────────────────────────────────

class RunRequest(BaseModel):
    """Request body for /run and /run/stream endpoints."""
    prompt: str = Field(..., min_length=1, max_length=8000, description="User message")
    session_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Session ID for multi-turn conversation state",
    )
    user_id: str = Field(default="anonymous", description="User ID for auth context")

class RunResponse(BaseModel):
    """Response body for /run endpoint."""
    session_id: str
    response: str
    tool_calls: list[dict] = []
    model: str = ""
    provider: str = "Vertex AI (ADK)"


# ── FastAPI App ──────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle."""
    logger.info(f"🚀 Mobivable ADK Agent Service starting on port {PORT}")
    logger.info(f"   Agent: {root_agent.name} (model: {root_agent.model})")
    logger.info(f"   Sub-agents: {[a.name for a in (root_agent.sub_agents or [])]}")
    yield
    logger.info("Shutting down ADK Agent Service")


app = FastAPI(
    title="Mobivable ADK Agent Service",
    description="AI agent orchestration service built on Google's Agent Development Kit (ADK)",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Health check endpoint for Cloud Run."""
    return {
        "status": "healthy",
        "service": "mobivable-adk",
        "agent": root_agent.name,
        "model": root_agent.model,
        "sub_agents": [a.name for a in (root_agent.sub_agents or [])],
    }


@app.post("/run", response_model=RunResponse)
async def run_agent(req: RunRequest):
    """
    Run a single agent turn (non-streaming).

    The ADK Runner handles the full tool-use loop:
    1. Send user message to the model
    2. If model calls tools → execute them → feed results back
    3. Repeat until the model returns a text-only response
    4. Return the final response
    """
    try:
        # Get or create session
        session = await session_service.get_session(
            app_name=APP_NAME,
            user_id=req.user_id,
            session_id=req.session_id,
        )
        if session is None:
            session = await session_service.create_session(
                app_name=APP_NAME,
                user_id=req.user_id,
                session_id=req.session_id,
            )

        # Create the user message
        user_content = types.Content(
            role="user",
            parts=[types.Part.from_text(text=req.prompt)],
        )

        # Run the agent
        final_text = ""
        tool_calls_log = []

        async for event in runner.run_async(
            user_id=req.user_id,
            session_id=req.session_id,
            new_message=user_content,
        ):
            # Collect the final response text from the agent
            if event.is_final_response():
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            final_text += part.text

            # Log tool calls for observability
            if hasattr(event, "function_calls") and event.function_calls:
                for fc in event.function_calls:
                    tool_calls_log.append({
                        "name": fc.name,
                        "args": dict(fc.args) if fc.args else {},
                    })

        return RunResponse(
            session_id=req.session_id,
            response=final_text,
            tool_calls=tool_calls_log,
            model=root_agent.model,
            provider="Vertex AI (ADK)",
        )

    except Exception as e:
        logger.error(f"Agent run error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/run/stream")
async def run_agent_stream(req: RunRequest):
    """
    Run a single agent turn with SSE streaming.

    Streams events as they happen:
    - {"type": "delta", "text": "..."} — text chunks from the model
    - {"type": "tool_start", "name": "...", "args": {...}} — tool invocations
    - {"type": "tool_result", "name": "...", "result": "..."} — tool results
    - {"type": "done", "session_id": "..."} — final event
    """
    async def event_stream():
        try:
            # Get or create session
            session = await session_service.get_session(
                app_name=APP_NAME,
                user_id=req.user_id,
                session_id=req.session_id,
            )
            if session is None:
                session = await session_service.create_session(
                    app_name=APP_NAME,
                    user_id=req.user_id,
                    session_id=req.session_id,
                )

            # Create the user message
            user_content = types.Content(
                role="user",
                parts=[types.Part.from_text(text=req.prompt)],
            )

            # Run the agent and stream events
            async for event in runner.run_async(
                user_id=req.user_id,
                session_id=req.session_id,
                new_message=user_content,
            ):
                # Stream text deltas
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            data = json.dumps({"type": "delta", "text": part.text})
                            yield f"data: {data}\n\n"

                        # Stream function calls
                        if part.function_call:
                            fc = part.function_call
                            data = json.dumps({
                                "type": "tool_start",
                                "name": fc.name,
                                "args": dict(fc.args) if fc.args else {},
                            })
                            yield f"data: {data}\n\n"

                        # Stream function responses
                        if part.function_response:
                            fr = part.function_response
                            data = json.dumps({
                                "type": "tool_result",
                                "name": fr.name,
                                "result": str(fr.response)[:2000],
                            })
                            yield f"data: {data}\n\n"

            # Final event
            done_data = json.dumps({
                "type": "done",
                "session_id": req.session_id,
            })
            yield f"data: {done_data}\n\n"

        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            error_data = json.dumps({"type": "error", "error": str(e)})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Entrypoint ───────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
