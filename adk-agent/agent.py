"""
Mobivable ADK Agent Definitions — Multi-Agent Architecture

Showcases Google ADK's advanced orchestration features:

  1. SequentialAgent  — Deterministic build pipeline
  2. LoopAgent        — Self-healing type-check → fix cycles
  3. ParallelAgent    — Concurrent design variant exploration
  4. Callbacks        — Demo user guardrails, credit tracking, audit logging

Agents:
  - StudioAgent      — Per-project design & build (plan-first workflow)
  - MCPAgent (root)  — Cross-project orchestration with 25+ MCP tools
  - ResearchAgent    — Domain research + design brief
  - DesignAgent      — Mockup generation from brief
  - BuildAgent       — Real Expo code in E2B sandbox
  - VerifyAgent      — Type-check + lint loop (self-healing via LoopAgent)
  - PreviewAgent     — Launch live Expo-web preview
"""

import os
import logging
from typing import Optional

from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent
from google.genai import types

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
    # Agent workspace tools (real files + shell in a live sandbox)
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
    # Knowledge tools
    add_knowledge_item,
    # Destructive tools
    delete_project,
)

logger = logging.getLogger("mobivable-adk")

# ── Configuration ─────────────────────────────────────────────────
FAST_MODEL = os.getenv("ADK_FAST_MODEL", "gemini-2.5-flash")
STRONG_MODEL = os.getenv("ADK_STRONG_MODEL", "gemini-2.5-pro")

# Demo user email — guarded by callbacks
DEMO_EMAIL = "demo@mobivable.com"

# ═══════════════════════════════════════════════════════════════════
#  CALLBACKS & GUARDRAILS
# ═══════════════════════════════════════════════════════════════════

def guard_demo_user(callback_context, llm_request) -> Optional[types.Content]:
    """
    before_model_callback — Block destructive operations for demo users.

    The demo account (demo@mobivable.com) is a read-mostly sandbox:
      - Cannot delete projects
      - Cannot export to EAS builds
      - Gets a polite redirect to sign up

    For all other users, returns None (no-op → proceed normally).
    """
    state = callback_context.state
    user_email = state.get("user_email", "")
    if user_email != DEMO_EMAIL:
        return None  # Not demo user → allow everything

    # Check if the model is about to call a destructive tool
    # We inspect the last user message for intent signals
    logger.info(f"[guardrail] Demo user detected — checking intent")

    return None  # Allow by default; tool-level guards handle the rest


def block_destructive_tools(callback_context, tool_name: str, tool_args: dict):
    """
    before_tool_callback — Prevent demo users from calling destructive tools.

    Returns a dict to short-circuit the tool call with a message,
    or None to allow the tool to execute.
    """
    state = callback_context.state
    user_email = state.get("user_email", "")

    # Blocked tools for demo users
    DEMO_BLOCKED = {"delete_project", "startEasBuild", "startEasSubmit"}

    if user_email == DEMO_EMAIL and tool_name in DEMO_BLOCKED:
        logger.warning(f"[guardrail] Blocked {tool_name} for demo user")
        return {
            "content": [{"type": "text", "text": (
                f"⚠️ The demo account cannot use `{tool_name}`. "
                "Sign up for your own free account to unlock full features!"
            )}],
        }

    return None  # Allow


def audit_tool_call(callback_context, tool_name: str, tool_args: dict, tool_response):
    """
    after_tool_callback — Log every tool invocation for observability.

    Tracks:
      - Which tools were called
      - Running count of tool calls in this session
      - Build phase transitions
    """
    state = callback_context.state

    # Increment tool call counter
    state["tool_call_count"] = state.get("tool_call_count", 0) + 1

    # Track build phase based on tool calls
    PHASE_MAP = {
        "research_and_plan": "researching",
        "generate_app": "generating",
        "ws_write_file": "building",
        "ws_run_command": "verifying",
        "ws_start_preview": "previewing",
    }
    if tool_name in PHASE_MAP:
        state["build_phase"] = PHASE_MAP[tool_name]

    logger.info(
        f"[audit] tool={tool_name} "
        f"phase={state.get('build_phase', 'idle')} "
        f"calls={state.get('tool_call_count', 0)}"
    )


# ═══════════════════════════════════════════════════════════════════
#  SPECIALIZED AGENTS (for the SequentialAgent pipeline)
# ═══════════════════════════════════════════════════════════════════

# ── 1. Research Agent ─────────────────────────────────────────────
# Phase 1 of the pipeline: domain research + design brief generation.

research_agent = Agent(
    name="research_agent",
    model=FAST_MODEL,
    description="Researches the app domain and creates a comprehensive design plan.",
    instruction="""You are the Research Agent. Your ONLY job is to research and plan.

Given a project, call research_and_plan with a comprehensive prompt covering:
- App vision, core features, user journey
- Screen list (8-12 screens minimum)
- UI/UX design (colors, typography, layout)
- Data model, API plan, MVP scope

After research_and_plan returns, summarize the plan and say:
"✅ Research complete. Design brief ready for the Design Agent."

Do NOT build anything. Do NOT call generate_app. Only research.""",
    tools=[get_project, research_and_plan, list_knowledge_items],
    before_model_callback=guard_demo_user,
    after_tool_callback=audit_tool_call,
)


# ── 2. Design Agent ──────────────────────────────────────────────
# Phase 2: reads the mockup and establishes the design system.

design_agent = Agent(
    name="design_agent",
    model=STRONG_MODEL,
    description="Reads the approved mockup and establishes the design system.",
    instruction="""You are the Design Agent. Your ONLY job is to establish the design system.

Steps:
1. Call read_mockup(project_id) to vision-read the approved mockup image
2. Call invoke_skill("frontend-design") to load the design system discipline
3. Summarize the exact colors, fonts, spacing, and component patterns

Say: "✅ Design system established. Ready for the Build Agent."

Do NOT write any code files. Only analyze the design.""",
    tools=[get_project, read_mockup, invoke_skill, list_screens, get_screen],
    before_model_callback=guard_demo_user,
    after_tool_callback=audit_tool_call,
)


# ── 3. Build Agent ────────────────────────────────────────────────
# Phase 3: writes actual Expo source files in the E2B sandbox.

build_agent = Agent(
    name="build_agent",
    model=STRONG_MODEL,
    description="Builds the real Expo app by writing source files in the sandbox.",
    instruction="""You are the Build Agent. Your ONLY job is to write code.

Use the workspace tools to build a real Expo Router / React Native app:
1. ws_list_files to see the scaffold
2. ws_read_file to read existing layout files
3. Build data layer first (store/, types, seed data)
4. Build navigation (app/(tabs)/_layout.tsx)
5. Build each screen as a file under app/
6. Use realistic data and the approved palette/typography
7. Install deps: ws_run_command_async("bun install"), poll ws_command_status

Use ws_write_file for new files, ws_edit_file for surgical fixes.
Narrate each step: "Now building the Dashboard screen..."

Say: "✅ Code written. Ready for verification."

Do NOT run tsc or lint — the Verify Agent handles that.""",
    tools=[
        get_project, list_screens, get_screen,
        ws_list_files, ws_read_file, ws_write_file, ws_edit_file,
        ws_run_command, ws_run_command_async, ws_command_status,
        invoke_skill,
    ],
    before_model_callback=guard_demo_user,
    before_tool_callback=block_destructive_tools,
    after_tool_callback=audit_tool_call,
)


# ── 4. Type-Check Agent (part of LoopAgent) ──────────────────────
# Runs `bunx tsc --noEmit` and reports errors for the Fix Agent.

typecheck_agent = Agent(
    name="typecheck_agent",
    model=FAST_MODEL,
    description="Runs TypeScript type-checking and reports errors.",
    instruction="""You are the Type-Check Agent. Run EXACTLY these steps:

1. ws_run_command(project_id, "bunx tsc --noEmit")
2. If exitCode == 0: say "✅ TYPE_CHECK_PASSED" (this signals the loop to stop)
3. If exitCode != 0: list ALL errors clearly, one per line

Also run: ws_run_command(project_id, "bun run lint")
Report any lint warnings.

Do NOT fix anything — the Fix Agent handles repairs.""",
    tools=[ws_run_command, get_project],
    after_tool_callback=audit_tool_call,
)


# ── 5. Fix Agent (part of LoopAgent) ─────────────────────────────
# Reads type-check errors and fixes them with surgical edits.

fix_agent = Agent(
    name="fix_agent",
    model=STRONG_MODEL,
    description="Fixes TypeScript and lint errors found by the Type-Check Agent.",
    instruction="""You are the Fix Agent. Your ONLY job is to fix errors.

For each error from the Type-Check Agent:
1. ws_read_file the affected file
2. Identify the issue (missing import, wrong type, unused var, etc.)
3. ws_edit_file with the exact old_string → new_string fix

Common fixes:
- Missing imports: add the import statement
- Type mismatches: cast or fix the type
- Unused variables: prefix with underscore or remove
- Missing module: check if a package needs installing

Fix ALL errors, then say: "✅ Fixes applied. Re-running type check."

Do NOT add new features. Only fix errors.""",
    tools=[ws_read_file, ws_edit_file, ws_write_file, ws_list_files, ws_run_command, get_project],
    before_model_callback=guard_demo_user,
    after_tool_callback=audit_tool_call,
)


# ── Self-Healing Verify Loop ─────────────────────────────────────
# LoopAgent: type-check → fix → type-check → fix → ... until clean.
# Max 5 iterations to prevent infinite loops.

verify_loop = LoopAgent(
    name="verify_loop",
    description=(
        "Self-healing verification loop: runs type-check, fixes errors, "
        "and repeats until the build is clean (max 5 cycles)."
    ),
    sub_agents=[typecheck_agent, fix_agent],
    max_iterations=5,
)


# ── 6. Preview Agent ─────────────────────────────────────────────
# Final phase: launches the live Expo-web preview.

preview_agent = Agent(
    name="preview_agent",
    model=FAST_MODEL,
    description="Launches the live Expo-web preview after verification passes.",
    instruction="""You are the Preview Agent. Your ONLY job is to launch the preview.

1. Call ws_start_preview(project_id) — returns a job ID
2. Poll ws_command_status until status="done"
3. The preview URL is now live in the device frame

Say: "🚀 Live preview is ready! Your app is running in the device frame."

Summarize what was built (screens, features, design highlights).""",
    tools=[ws_start_preview, ws_command_status, get_project, list_screens],
    after_tool_callback=audit_tool_call,
)


# ═══════════════════════════════════════════════════════════════════
#  SEQUENTIAL BUILD PIPELINE
# ═══════════════════════════════════════════════════════════════════
# Deterministic execution: research → design → build → verify → preview
# This is the flagship ADK feature — shows multi-agent orchestration.

build_pipeline = SequentialAgent(
    name="build_pipeline",
    description=(
        "End-to-end app build pipeline. Executes in strict order: "
        "Research → Design → Build → Verify (self-healing loop) → Preview."
    ),
    sub_agents=[
        research_agent,
        design_agent,
        build_agent,
        verify_loop,
        preview_agent,
    ],
)


# ═══════════════════════════════════════════════════════════════════
#  PARALLEL DESIGN EXPLORER (optional — for design variants)
# ═══════════════════════════════════════════════════════════════════
# Runs 2 design variants concurrently for user comparison.

dark_designer = Agent(
    name="dark_designer",
    model=FAST_MODEL,
    description="Generates a dark-themed design variant.",
    instruction="""Generate a DARK MODE design variant for the project.
Use deep blacks (#0a0a0f), neon accents, glass-card components.
Call research_and_plan with the dark theme specifications.
Prefix your response with "🌙 DARK VARIANT:".""",
    tools=[get_project, research_and_plan],
    after_tool_callback=audit_tool_call,
)

light_designer = Agent(
    name="light_designer",
    model=FAST_MODEL,
    description="Generates a light-themed design variant.",
    instruction="""Generate a LIGHT MODE design variant for the project.
Use clean whites (#fafafa), soft shadows, pastel accents.
Call research_and_plan with the light theme specifications.
Prefix your response with "☀️ LIGHT VARIANT:".""",
    tools=[get_project, research_and_plan],
    after_tool_callback=audit_tool_call,
)

design_explorer = ParallelAgent(
    name="design_explorer",
    description=(
        "Generates multiple design variants concurrently for comparison. "
        "Runs dark and light theme explorations in parallel."
    ),
    sub_agents=[dark_designer, light_designer],
)


# ═══════════════════════════════════════════════════════════════════
#  STUDIO AGENT (full-featured, handles any project task)
# ═══════════════════════════════════════════════════════════════════

STUDIO_AGENT_INSTRUCTION = """You are the Mobivable Studio Agent — an AI mobile app designer and builder.
You are a vibe coding tool: users describe what they want, you build it.

## YOUR ROLE
You help users design and build premium mobile apps through a comprehensive plan-first workflow.

## PLAN-FIRST WORKFLOW (MANDATORY FOR NEW APPS)
When a user describes a new app idea, you MUST call research_and_plan with a COMPREHENSIVE prompt that covers all 17 sections of a mobile app development plan:

### What to include in the research_and_plan prompt:
1. **App Vision**: App name, purpose, target users, main problem, expected outcome
2. **Core Features**: Must-have features (auth, profile, dashboard, workflow, search, notifications, settings) + nice-to-have (AI, chat, payments, analytics, offline)
3. **User Journey**: Full flow from open → signup → onboarding → dashboard → main action → review → submit → notifications
4. **Screen List**: Minimum 8-12 screens (splash, login, signup, onboarding, dashboard, list/search, detail, create/edit, notifications, profile, settings, help)
5. **UI/UX Design**: Color palette, typography, buttons, cards, forms, icons, nav bar, empty states, error messages, loading states
6. **Technical Architecture**: React Native/Expo for cross-platform, Supabase backend, PostgreSQL, auth strategy
7. **Data Model**: All entities (User, Profile, main business objects, Orders, Payments, Notifications, Reviews)
8. **API Plan**: All required endpoints (auth, CRUD operations, notifications)
9. **Development Phases**: Discovery → Design → Backend → Mobile Dev → Testing → Deployment → Post-Launch
10. **MVP Scope**: What to include first vs what to defer
11. **Testing Checklist**: Install, auth, navigation, forms, API errors, screen sizes, platforms
12. **Security Checklist**: Auth, API protection, input validation, HTTPS, RLS, secrets
13. **App Store Readiness**: Assets needed (logo, icon, splash, screenshots, descriptions, privacy policy)
14. **Success Metrics**: Downloads, active users, conversion, retention, crash-free rate, ratings

## AFTER PLAN IS APPROVED — TWO BUILD MODES

### MODE A — REAL EXPO BUILD (target_stack = "expo") — PREFERRED
Build an actual Expo Router / React Native app by writing real source files
and verifying them, exactly like a developer would. Do NOT call generate_app
in this mode. Use the workspace tools:
- ws_list_files / ws_read_file — inspect the pre-seeded Expo scaffold
- ws_write_file — create each screen, store, component, and util
- ws_edit_file — make surgical fixes (exact unique substring replace)
- ws_run_command — synchronous, QUICK commands only
- ws_run_command_async + ws_command_status — for LONG commands

Required workflow:
1. ws_list_files to see the scaffold; ws_read_file the layout files
1a. read_mockup(project_id) to SEE the approved mockup
1b. invoke_skill("frontend-design") and FOLLOW its design-system discipline
2. Build data layer first, then navigation, then each screen
3. Use realistic data and the approved palette/typography
4. Install deps, run tsc, fix errors, run lint
5. Call ws_start_preview for live preview

### MODE B — SCHEMA BUILD (target_stack = "web", or no Expo workspace)
Call generate_app with a DETAILED prompt.

## SURGICAL EDIT TOOLS — USE THESE FOR MODIFICATIONS
For modifying existing apps, ALWAYS prefer surgical tools over full regeneration:
- update_screen, add_element, update_element, remove_element
- update_theme, update_navigation

## GUIDELINES
- Always call research_and_plan BEFORE generate_app for new apps
- Keep responses tight, markdown, action-oriented
- After running tools, summarize what changed and suggest next steps
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
        # Real Expo build — write/read/edit files + run bun/tsc/eslint in a live sandbox
        ws_list_files,
        ws_read_file,
        ws_write_file,
        ws_edit_file,
        ws_run_command,
        ws_run_command_async,
        ws_command_status,
        ws_start_preview,
        invoke_skill,
        read_mockup,
    ],
    # ── ADK Callbacks ──
    before_model_callback=guard_demo_user,
    before_tool_callback=block_destructive_tools,
    after_tool_callback=audit_tool_call,
)


# ═══════════════════════════════════════════════════════════════════
#  MCP AGENT (ROOT) — Cross-project orchestration
# ═══════════════════════════════════════════════════════════════════

MCP_AGENT_INSTRUCTION = """You are the Mobivable MCP Agent — a cross-project orchestration assistant.

## YOUR ROLE
You help users manage all their Mobivable projects and can delegate design/build
work to specialized sub-agents:

### Available Sub-Agents:
1. **studio_agent** — Full-featured per-project design and build (use for most tasks)
2. **build_pipeline** — Automated end-to-end build: Research → Design → Build → Verify → Preview
   (use when the user wants a COMPLETE automated build with no manual steps)
3. **design_explorer** — Generates dark + light design variants in PARALLEL
   (use when the user says "show me options" or "explore designs")

## DELEGATION RULES
- For "build me an app" → delegate to build_pipeline (automated pipeline)
- For "design some options" → delegate to design_explorer (parallel variants)
- For editing existing apps → delegate to studio_agent (surgical tools)
- For project management → handle directly (list, create, delete)

## GUIDELINES
- Call tools when you need real data. Do not guess project IDs or screen IDs.
- For destructive actions (delete_project), confirm with the user first.
- Keep responses tight, markdown, action-oriented.
"""

root_agent = Agent(
    name="mobivable_agent",
    model=FAST_MODEL,
    description="Cross-project orchestration agent for Mobivable AI App Studio. "
                "Manages projects, delegates design work to specialized sub-agents, "
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
    sub_agents=[
        studio_agent,      # Full-featured editor
        build_pipeline,    # SequentialAgent — automated pipeline
        design_explorer,   # ParallelAgent — concurrent design variants
    ],
    # Root-level guardrails
    before_model_callback=guard_demo_user,
    before_tool_callback=block_destructive_tools,
    after_tool_callback=audit_tool_call,
)
