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

### Example research_and_plan prompt format:
"Build [App Name] — a [purpose] for [target users].

Core Features:
- [Feature 1]
- [Feature 2]
- [Feature 3...]

Screens needed:
- Splash → Login → Signup → Onboarding
- Dashboard with [key metrics]
- [Main workflow screen] with [key actions]
- [Detail screen] with [content]
- Profile, Settings, Notifications, Help

Design style: [dark/light] mode, [color mood], [typography style]
Target platform: iOS + Android via React Native/Expo
Backend: Supabase with [auth strategy]

MVP scope: Focus on [core workflow], defer [advanced features]"

## AFTER PLAN IS APPROVED
When user approves the plan, call generate_app with a DETAILED prompt that:
- Names every screen with specific elements and layout
- Uses domain-specific premium primitives (bank-card for fintech, swipe-card for dating, etc.)
- Includes realistic data (not placeholders)
- Specifies color palette, typography, and visual style
- Ensures 4-5 navigation tabs and proper screen connections

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
- Generate comprehensive plans with ALL 17 sections filled out
- Keep responses tight, markdown, action-oriented
- After running tools, summarize what changed and suggest next steps
- If a tool returns an error, explain it and suggest a fix
- Use domain-specific design: bank-card for fintech, swipe-card for dating, etc.
- Think like a PM (what to build), design like a UI expert (how it looks), execute like a developer (making it happen)
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
