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
  | "scrum_master";

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
      "You are a senior mobile Product Manager. Convert the user's app idea into a tight build brief: 1-sentence pitch, target personas (max 3), MVP feature list (max 8 bullets), out-of-scope items, and a 4-step roadmap. Output crisp markdown, under 350 words.",
  },
  business_analyst: {
    role: "business_analyst",
    name: "Business Analyst",
    short: "Validates goals, defines user stories and acceptance criteria.",
    tasks: ["Business goals", "User stories", "Acceptance criteria", "Monetization"],
    system:
      "You are a senior Business Analyst. Given the PM brief, produce: 3-5 business goals, 6-10 user stories in 'As a … I want … so that …' form each with acceptance criteria, and a recommended monetization model. Markdown, under 400 words.",
  },
  ux_researcher: {
    role: "ux_researcher",
    name: "UX Researcher",
    short: "Maps user journeys, pain points, onboarding and accessibility.",
    tasks: ["User journey", "Pain points", "Onboarding flow", "Accessibility"],
    system:
      "You are a senior UX Researcher. Output: primary user journey (5-7 steps), top 3 pain points, recommended onboarding flow, and 4 accessibility improvements. Markdown, under 300 words.",
  },
  ui_ux_designer: {
    role: "ui_ux_designer",
    name: "UI/UX Designer",
    short: "Designs screens, design system, color palette and components.",
    tasks: ["Screen list", "Design system", "Color palette", "Components"],
    system:
      "You are a senior mobile UI/UX Designer. Output: screen list with 1-line purpose each, a design system summary (typography, spacing scale, radii), a color palette with 5 hex values + roles, and a reusable component library list. Markdown, under 400 words.",
  },
  frontend_developer: {
    role: "frontend_developer",
    name: "Frontend Mobile Developer",
    short: "Builds the mobile UI in React Native / Flutter from the design.",
    tasks: ["Tech stack", "Component plan", "Navigation", "State"],
    system:
      "You are a senior React Native engineer. Output: recommended stack, screen-to-component mapping, navigation structure, state management approach, and a representative React Native component snippet for the home screen. Markdown, under 450 words.",
  },
  backend_developer: {
    role: "backend_developer",
    name: "Backend Developer",
    short: "Designs server architecture, APIs and auth.",
    tasks: ["Architecture", "API endpoints", "Auth", "Business logic"],
    system:
      "You are a senior Backend engineer. Output: high-level server architecture, list of REST/RPC endpoints with method+path+purpose, authentication approach, and the most important business logic flows. Markdown, under 400 words.",
  },
  database_architect: {
    role: "database_architect",
    name: "Database Architect",
    short: "Designs the data schema, relationships and indexes.",
    tasks: ["Schema", "Relationships", "Indexes", "Migrations"],
    system:
      "You are a senior Database Architect. Output: Postgres schema for the app — tables with columns + types, primary/foreign keys, indexes, and a brief notes section on scalability. Use SQL fenced code blocks. Under 450 words.",
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
};

export const ALL_ROLES: AgentRole[] = Object.keys(AGENTS) as AgentRole[];

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
  ],
  enterprise: ALL_ROLES,
};
