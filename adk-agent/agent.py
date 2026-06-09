"""
Mobivable ADK Agent Definitions

Defines the multi-agent system using Google's Agent Development Kit (ADK).
Two primary agents mirror the existing TypeScript architecture:

  1. StudioAgent  — Per-project design & build agent (plan-first workflow)
  2. MCPAgent     — Cross-project orchestration agent with 25+ MCP tools

The agents use Gemini models via Vertex AI and delegate tool execution
to the Node.js MCP server through the bridge in tools.py.
"""

import os
from google.adk.agents import Agent

from tools import (
    # Read tools
    list_projects,
    get_project,
    list_screens,
    get_screen,
    get_chat_history,
    list_knowledge_items,
    # Write tools
    create_project,
    research_and_plan,
    generate_app,
    # Surgical edit tools
    update_screen,
    add_element,
    update_element,
    remove_element,
    update_theme,
    update_navigation,
    verify_schema,
    # Code generation tools
    generate_code,
    export_project_code,
    # Knowledge tools
    add_knowledge_item,
    # Destructive tools
    delete_project,
)

# ── Configuration ─────────────────────────────────────────────────
# Model selection: use Vertex AI Gemini models
FAST_MODEL = os.getenv("ADK_FAST_MODEL", "gemini-2.5-flash")
STRONG_MODEL = os.getenv("ADK_STRONG_MODEL", "gemini-2.5-pro")

# ── Studio Agent ──────────────────────────────────────────────────
# The Studio Agent handles per-project design and build workflows.
# It follows the plan-first approach: research → design brief → mockup
# → user approval → generate app → verify → images → live preview.

STUDIO_AGENT_INSTRUCTION = """You are the Mobivable Studio Agent — an AI mobile app designer and builder.

## YOUR ROLE
You help users design and build premium mobile apps through a plan-first workflow:
1. Research the domain and create a design plan with mockup (research_and_plan)
2. Wait for user approval of the design brief
3. Generate the full app schema (generate_app)
4. Verify the schema for errors (verify_schema)
5. Generate images for the app assets
6. Present the live preview

## SURGICAL EDIT TOOLS — USE THESE FOR MODIFICATIONS
For modifying existing apps, ALWAYS prefer surgical tools over full regeneration:
- update_screen: change a screen's title, layout, background, transition
- add_element: add a single element to a screen at a specific position
- update_element: change one element's props (e.g., button label, card title)
- remove_element: remove an element by index
- update_theme: change colors, fonts, spacing — merge-style, only provided fields change
- update_navigation: change nav type, add/remove tabs

## WORKFLOW FOR EDITING
1. Call list_screens to see the current state
2. Call get_screen to read elements on the target screen
3. Use surgical tools to make precise changes
4. Call verify_schema to check for issues
5. If issues found, fix them immediately with more surgical tools
6. Only respond once all issues are resolved

## GUIDELINES
- Always call research_and_plan BEFORE generate_app for new apps
- Keep responses tight, markdown, action-oriented
- After running tools, summarize what changed and suggest next steps
- If a tool returns an error, explain it and suggest a fix
- Use domain-specific design: bank-card for fintech, swipe-card for dating, etc.
"""

studio_agent = Agent(
    name="studio_agent",
    model=STRONG_MODEL,
    description="Per-project design and build agent. Handles the plan-first "
                "workflow: research → design brief → mockup → approval → build.",
    instruction=STUDIO_AGENT_INSTRUCTION,
    tools=[
        # Read
        get_project,
        list_screens,
        get_screen,
        get_chat_history,
        list_knowledge_items,
        # Plan-first workflow
        research_and_plan,
        generate_app,
        # Surgical edits
        update_screen,
        add_element,
        update_element,
        remove_element,
        update_theme,
        update_navigation,
        # Verification
        verify_schema,
        # Code generation
        generate_code,
        export_project_code,
    ],
)


# ── MCP Agent (Root Agent) ────────────────────────────────────────
# The MCP Agent is the cross-project orchestration agent. It can
# manage multiple projects, delegate to the Studio Agent for
# per-project work, and handle knowledge base operations.

MCP_AGENT_INSTRUCTION = """You are the Mobivable MCP Agent — a cross-project orchestration assistant.

## YOUR ROLE
You help users manage all their Mobivable projects and can delegate design/build
work to the Studio Agent. You handle:
- Listing and managing projects across the user's account
- Creating new projects and kicking off the design workflow
- Cross-project queries (e.g., "show me all my fintech apps")
- Knowledge base management (adding PRDs, design notes, URLs)

## DELEGATION
For per-project design and build tasks (editing screens, generating apps, etc.),
delegate to the Studio Agent by describing the task clearly.

## GUIDELINES
- Call tools when you need real data. Do not guess project IDs or screen IDs.
- For destructive actions (delete_project), confirm with the user first.
- Keep responses tight, markdown, action-oriented.
- After running tools, summarize what changed and suggest next steps.
"""

# The root agent uses the fast model for routing/classification
# and delegates heavy work to the studio_agent (strong model).
root_agent = Agent(
    name="mobivable_agent",
    model=FAST_MODEL,
    description="Cross-project orchestration agent for Mobivable AI App Studio. "
                "Manages projects, delegates design work to the Studio Agent, "
                "and handles knowledge base operations.",
    instruction=MCP_AGENT_INSTRUCTION,
    tools=[
        # Project management
        list_projects,
        create_project,
        delete_project,
        # Knowledge base
        list_knowledge_items,
        add_knowledge_item,
        # Quick reads
        get_project,
        list_screens,
    ],
    sub_agents=[studio_agent],
)
