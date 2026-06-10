"""
Mobivable ADK Tool Wrappers — Bridge to Node.js MCP Tools

Each tool function here wraps a call to the Mobivable Node.js server's
MCP endpoint. This keeps the source of truth in the TypeScript codebase
while letting ADK orchestrate the tool-use loop natively.

The MOBIVABLE_MCP_URL env var points at the main Cloud Run service
(e.g., https://mobivable-xxxxx.run.app/api/public/mcp). For local dev
it falls back to http://localhost:3000/api/public/mcp.
"""

import os
import json
import httpx
import contextvars
from typing import Any

# ── Configuration ─────────────────────────────────────────────────
MCP_BASE_URL = os.getenv(
    "MOBIVABLE_MCP_URL",
    "http://localhost:3000/api/public/mcp",
)
# Service-to-service auth token (internal Cloud Run → Cloud Run)
MCP_AUTH_TOKEN = os.getenv("MCP_SERVICE_TOKEN", "")

# Thread-local user_id context — set by the server before running tools
# so every MCP call is attributed to the actual project owner.
_current_user_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "current_user_id", default="anonymous"
)

_client = httpx.AsyncClient(timeout=120.0)


async def _call_mcp_tool(tool_name: str, arguments: dict[str, Any]) -> dict:
    """Call a Mobivable MCP tool via the JSON-RPC endpoint."""
    headers = {"Content-Type": "application/json"}
    if MCP_AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {MCP_AUTH_TOKEN}"

    # Pass the real user_id so the MCP endpoint can verify project ownership
    user_id = _current_user_id.get()
    if user_id and user_id != "anonymous":
        headers["X-User-Id"] = user_id

    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
    }

    resp = await _client.post(MCP_BASE_URL, json=payload, headers=headers)
    resp.raise_for_status()
    data = resp.json()

    if "error" in data:
        return {"error": data["error"].get("message", str(data["error"]))}
    return data.get("result", {})


# ── Read Tools ────────────────────────────────────────────────────

async def list_projects(limit: int = 20) -> dict:
    """List the user's Mobivable projects, newest first.
    Returns project id, name, prompt, status, model, and updated_at.
    """
    return await _call_mcp_tool("list_projects", {"limit": limit})


async def get_project(project_id: str) -> dict:
    """Get one project with its full MobileAppSchema, theme, and status."""
    return await _call_mcp_tool("get_project", {"project_id": project_id})


async def list_screens(project_id: str) -> dict:
    """List screens (id, title, layout, element count) from a project's schema."""
    return await _call_mcp_tool("list_screens", {"project_id": project_id})


async def get_screen(project_id: str, screen_id: str) -> dict:
    """Get one screen's full element list for reading or reasoning."""
    return await _call_mcp_tool("get_screen", {
        "project_id": project_id,
        "screen_id": screen_id,
    })


async def get_chat_history(project_id: str, limit: int = 50) -> dict:
    """Recent chat turns for a project, ordered oldest to newest."""
    return await _call_mcp_tool("get_chat_history", {
        "project_id": project_id,
        "limit": limit,
    })


async def list_knowledge_items(limit: int = 20) -> dict:
    """List the user's saved knowledge items (PRDs, design notes, URLs)."""
    return await _call_mcp_tool("list_knowledge_items", {"limit": limit})


# ── Write Tools ───────────────────────────────────────────────────

async def create_project(name: str, prompt: str, model: str = "google/gemini-2.5-flash") -> dict:
    """Create a new Mobivable project from a one-paragraph app idea."""
    return await _call_mcp_tool("create_project", {
        "name": name,
        "prompt": prompt,
        "model": model,
    })


async def research_and_plan(project_id: str, prompt: str) -> dict:
    """Research the domain and create a design plan with AI mockup.
    ALWAYS call this BEFORE generate_app for new apps.
    Returns a structured plan with color palette, typography, screens, and mockup.
    """
    return await _call_mcp_tool("research_and_plan", {
        "project_id": project_id,
        "prompt": prompt,
    })


async def generate_app(project_id: str, prompt: str) -> dict:
    """Generate a complete mobile app schema from a prompt.
    Requires research_and_plan to be called first and user approval.
    Creates screens, navigation, theme — saves directly to the project.
    """
    return await _call_mcp_tool("generate_app", {
        "project_id": project_id,
        "prompt": prompt,
    })


# ── Surgical Edit Tools ──────────────────────────────────────────

async def update_screen(
    project_id: str,
    screen_id: str,
    title: str = "",
    layout: str = "",
    icon: str = "",
    transition: str = "",
) -> dict:
    """Update a specific screen's properties without regenerating the schema."""
    args: dict[str, Any] = {
        "project_id": project_id,
        "screen_id": screen_id,
    }
    if title:
        args["title"] = title
    if layout:
        args["layout"] = layout
    if icon:
        args["icon"] = icon
    if transition:
        args["transition"] = transition
    return await _call_mcp_tool("update_screen", args)


async def add_element(
    project_id: str,
    screen_id: str,
    element: str,
    position: int = -1,
) -> dict:
    """Add a UI element to a screen at a specific position.
    Element should be a JSON string like: {"type": "button", "props": {"label": "Click me"}}.
    """
    return await _call_mcp_tool("add_element", {
        "project_id": project_id,
        "screen_id": screen_id,
        "element": element,
        "position": position,
    })


async def update_element(
    project_id: str,
    screen_id: str,
    element_index: int,
    updates: str,
) -> dict:
    """Update an element's properties by index. Updates is a JSON string of props to merge."""
    return await _call_mcp_tool("update_element", {
        "project_id": project_id,
        "screen_id": screen_id,
        "element_index": element_index,
        "updates": updates,
    })


async def remove_element(
    project_id: str,
    screen_id: str,
    element_index: int,
) -> dict:
    """Remove an element from a screen by its index."""
    return await _call_mcp_tool("remove_element", {
        "project_id": project_id,
        "screen_id": screen_id,
        "element_index": element_index,
    })


async def update_theme(project_id: str, theme: str) -> dict:
    """Update the app's theme (colors, fonts, spacing). Merge-style: only provided fields change.
    Theme should be a JSON string of the theme fields to update.
    """
    return await _call_mcp_tool("update_theme", {
        "project_id": project_id,
        "theme": theme,
    })


async def update_navigation(project_id: str, navigation: str) -> dict:
    """Update the app's navigation structure. Navigation is a JSON string."""
    return await _call_mcp_tool("update_navigation", {
        "project_id": project_id,
        "navigation": navigation,
    })


async def verify_schema(project_id: str) -> dict:
    """Verify a project's schema for structural errors, broken nav links,
    empty screens, and other issues. Returns a list of issues found.
    """
    return await _call_mcp_tool("verify_schema", {"project_id": project_id})


async def generate_code(project_id: str, screen_id: str = "") -> dict:
    """Generate Flutter/Expo code for a screen or the full project."""
    args: dict[str, Any] = {"project_id": project_id}
    if screen_id:
        args["screen_id"] = screen_id
    return await _call_mcp_tool("generate_code", args)


async def export_project_code(project_id: str) -> dict:
    """Export a complete multi-screen Expo project with tab navigation."""
    return await _call_mcp_tool("export_project_code", {"project_id": project_id})


async def add_knowledge_item(title: str, content: str) -> dict:
    """Save a text snippet (PRD, brand notes, etc.) to the knowledge base."""
    return await _call_mcp_tool("add_knowledge_item", {
        "title": title,
        "content": content,
    })


async def delete_project(project_id: str) -> dict:
    """Hard-delete a project and all its data. Irreversible."""
    return await _call_mcp_tool("delete_project", {"project_id": project_id})


# ── Agent Workspace Tools — real files + shell in a live sandbox ──
# These let the Studio agent build a REAL Expo app: write source files and
# run bun/tsc/eslint against a persistent per-project sandbox, then fix errors.

async def ws_write_file(project_id: str, path: str, content: str) -> dict:
    """Create or overwrite a file in the project's live Expo build workspace.
    Use forward-slash paths relative to the workspace root, e.g.
    'app/(tabs)/index.tsx' or 'store/useAppStore.ts'. Persists + mirrors to the project.
    """
    return await _call_mcp_tool("ws_write_file", {
        "project_id": project_id,
        "path": path,
        "content": content,
    })


async def ws_read_file(project_id: str, path: str) -> dict:
    """Read a file from the project's live build workspace. Returns its text."""
    return await _call_mcp_tool("ws_read_file", {
        "project_id": project_id,
        "path": path,
    })


async def ws_edit_file(project_id: str, path: str, old_string: str, new_string: str) -> dict:
    """Surgically edit a workspace file by replacing an exact, UNIQUE substring.
    old_string must occur exactly once. Prefer this over ws_write_file for small fixes.
    """
    return await _call_mcp_tool("ws_edit_file", {
        "project_id": project_id,
        "path": path,
        "old_string": old_string,
        "new_string": new_string,
    })


async def ws_list_files(project_id: str, path: str = ".") -> dict:
    """List files/directories at a path in the project's build workspace."""
    return await _call_mcp_tool("ws_list_files", {
        "project_id": project_id,
        "path": path,
    })


async def ws_run_command(project_id: str, command: str, timeout_ms: int = 0) -> dict:
    """Run an allowlisted shell command in the workspace (cwd = workspace root).
    Allowed: bun, bunx, npm, npx, node, tsc, eslint, expo, ls, cat, find, grep,
    head, tail, mkdir, rm, mv, cp. Use for `bunx tsc --noEmit`, `bun run lint`,
    `bun install`. Returns exitCode, stdout, stderr.
    """
    args: dict[str, Any] = {"project_id": project_id, "command": command}
    if timeout_ms:
        args["timeout_ms"] = timeout_ms
    return await _call_mcp_tool("ws_run_command", args)


async def ws_run_command_async(project_id: str, command: str) -> dict:
    """Start a LONG shell command (e.g. `bun install`, `bunx expo export -p web`)
    in the background and return a job id immediately. Poll ws_command_status
    until done. Use the synchronous ws_run_command only for quick checks.
    """
    return await _call_mcp_tool("ws_run_command_async", {
        "project_id": project_id,
        "command": command,
    })


async def ws_command_status(project_id: str, job_id: str) -> dict:
    """Check a background job (from ws_run_command_async or ws_start_preview).
    Returns status ('running'|'done'), exitCode when done, and output so far.
    """
    return await _call_mcp_tool("ws_command_status", {
        "project_id": project_id,
        "job_id": job_id,
    })


async def ws_start_preview(project_id: str, rebuild: bool = False) -> dict:
    """Build the Expo app for web and start the live preview, returning a public URL
    the studio renders in the device frame. Call this as the FINAL build step,
    after `bunx tsc --noEmit` and `bun run lint` pass. Pass rebuild=true to
    re-export after later edits.
    """
    args: dict[str, Any] = {"project_id": project_id}
    if rebuild:
        args["rebuild"] = rebuild
    return await _call_mcp_tool("ws_start_preview", args)


async def invoke_skill(name: str) -> dict:
    """Load a reusable instruction skill by name and return its body to follow.
    Use invoke_skill("frontend-design") during an Expo build (after reading the
    mockup, before writing screens) to anchor the UI on a premium design system.
    """
    return await _call_mcp_tool("invoke_skill", {"name": name})


async def read_mockup(project_id: str) -> dict:
    """Vision-read the project's APPROVED mockup image and return a pixel-level
    description (exact colors, fonts, per-screen layout, components, data). Call
    this FIRST in an Expo build — the mockup is the source of truth above the
    text brief. Also saves the analysis to designs/mockup.md in the workspace.
    """
    return await _call_mcp_tool("read_mockup", {"project_id": project_id})


# ── Collect all tools for ADK agent registration ─────────────────

ALL_TOOLS = [
    # Read
    list_projects,
    get_project,
    list_screens,
    get_screen,
    get_chat_history,
    list_knowledge_items,
    # Write
    create_project,
    research_and_plan,
    generate_app,
    # Surgical edits
    update_screen,
    add_element,
    update_element,
    remove_element,
    update_theme,
    update_navigation,
    verify_schema,
    # Code generation
    generate_code,
    export_project_code,
    # Knowledge
    add_knowledge_item,
    # Destructive
    delete_project,
    # Agent workspace (real files + shell)
    ws_write_file,
    ws_read_file,
    ws_edit_file,
    ws_list_files,
    ws_run_command,
    ws_run_command_async,
    ws_command_status,
    ws_start_preview,
    invoke_skill,
    read_mockup,
]
