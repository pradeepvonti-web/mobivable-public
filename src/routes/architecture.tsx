import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/architecture")({
  component: ArchitecturePage,
  head: () => ({
    meta: [
      { title: "Architecture — Mobivable" },
      { name: "description", content: "Technical architecture of Mobivable AI App Studio — built on Google Cloud with Gemini, Vertex AI, MCP agents, and Cloud Run." },
      { property: "og:title", content: "Architecture — Mobivable" },
      { property: "og:description", content: "Explore how Mobivable uses Gemini, Vertex AI, MCP tools, and Cloud Run to power AI-driven mobile app creation." },
    ],
  }),
});

/* ─── Data ─────────────────────────────────────────────────── */

const layers = [
  {
    id: "ui",
    label: "User Interface",
    color: "#3B82F6",
    items: [
      { icon: "📊", name: "Dashboard", desc: "Project management & creation" },
      { icon: "💬", name: "AI Chat Agent", desc: "Conversational design & iteration" },
      { icon: "📱", name: "Mobile Preview", desc: "Real-time schema renderer" },
      { icon: "✏️", name: "Code Editor", desc: "Monaco JSON / code editor" },
    ],
  },
  {
    id: "server",
    label: "Application Server — Cloud Run",
    color: "#8B5CF6",
    items: [
      { icon: "🔄", name: "TanStack Start", desc: "React SSR + streaming server functions" },
      { icon: "🎨", name: "Studio Agent", desc: "Plan-first design workflow per project" },
      { icon: "🤖", name: "MCP Agent", desc: "Cross-project tool orchestration" },
      { icon: "🔍", name: "Schema Validator", desc: "Auto-verify after every write" },
    ],
  },
];

const mcpTools = [
  "research_and_plan", "generate_app", "update_screen", "add_element",
  "update_theme", "verify_schema", "generate_code", "export_project",
];

const googleCloud = [
  { icon: "✨", name: "Gemini 2.5 Flash / Pro", desc: "Primary LLM via Vertex AI — design briefs & schema generation" },
  { icon: "🖼️", name: "Gemini Flash Image", desc: "Mockups & in-app asset generation" },
  { icon: "🧠", name: "Agent Development Kit (ADK)", desc: "Google's framework for multi-agent orchestration" },
  { icon: "🔁", name: "Vertex AI", desc: "Primary AI platform — Gemini + Imagen 4.0 + Agent Engine" },
  { icon: "🚀", name: "Cloud Run", desc: "Serverless hosting — app + ADK agent service" },
  { icon: "🔨", name: "Cloud Build", desc: "CI/CD pipeline for both services" },
];

const dataLayer = [
  { icon: "🐘", name: "Supabase PostgreSQL", desc: "Schemas, chat history, credits, threads" },
  { icon: "🔐", name: "Supabase Auth", desc: "Google OAuth + email + RLS" },
  { icon: "📦", name: "Supabase Storage", desc: "AI-generated image assets" },
  { icon: "🔤", name: "Google Fonts API", desc: "30 curated font families" },
];

const workflowSteps = [
  "User Prompt", "🔬 research_and_plan", "📋 Design Brief + Mockup",
  "✅ User Approval", "🤖 generate_app", "🔍 verify_schema",
  "🖼️ Generate Images", "📱 Live Preview",
];

const badges = [
  "Gemini-Powered", "Agent Development Kit", "MCP Protocol", "Multi-Agent",
  "Plan-First", "Vertex AI", "Real-Time Streaming", "Cloud Run",
];

/* ─── Component ────────────────────────────────────────────── */

function ArchitecturePage() {
  return (
    <PageShell
      eyebrow="Technical Architecture"
      title="How Mobivable Works"
      intro="An AI-powered mobile app studio built on Google Cloud — from prompt to production-ready app in minutes."
    >
      {/* Badge row */}
      <div className="flex flex-wrap gap-2 mb-10 justify-center">
        {badges.map((b) => (
          <span
            key={b}
            className="text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-md border"
            style={{
              background: "rgba(16,185,129,0.08)",
              color: "#34D399",
              borderColor: "rgba(16,185,129,0.2)",
            }}
          >
            {b}
          </span>
        ))}
      </div>

      {/* Layers */}
      {layers.map((layer) => (
        <div key={layer.id} className="mb-4">
          <div
            className="rounded-2xl border p-6"
            style={{
              background: "rgba(255,255,255,0.02)",
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            <span
              className="inline-block text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-md mb-4"
              style={{
                background: `${layer.color}22`,
                color: layer.color,
              }}
            >
              {layer.id === "ui" ? "👤" : "⚙️"} {layer.label}
            </span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {layer.items.map((item) => (
                <div
                  key={item.name}
                  className="rounded-xl border p-4 text-center transition-colors hover:border-white/20"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    borderColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  <span className="text-xl block mb-1.5">{item.icon}</span>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Connector arrow */}
          <div className="flex justify-center py-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </div>
        </div>
      ))}

      {/* MCP Tools */}
      <div
        className="rounded-2xl border p-6 mb-4 text-center"
        style={{
          background: "rgba(255,255,255,0.02)",
          borderColor: "rgba(255,255,255,0.06)",
        }}
      >
        <p className="text-sm font-semibold mb-4">🔧 MCP Server — 25+ Tools</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {mcpTools.map((t) => (
            <span
              key={t}
              className="text-[11px] font-medium font-mono px-3 py-1.5 rounded-md"
              style={{
                background: "rgba(139,92,246,0.1)",
                color: "#C4B5FD",
                border: "1px solid rgba(139,92,246,0.25)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Connector arrow */}
      <div className="flex justify-center py-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>

      {/* Bottom: Google Cloud + Data Layer */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {/* Google Cloud */}
        <div
          className="rounded-2xl border p-6"
          style={{
            background: "rgba(255,255,255,0.02)",
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          <span
            className="inline-block text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-md mb-4"
            style={{ background: "rgba(16,185,129,0.12)", color: "#34D399" }}
          >
            ☁️ Google Cloud
          </span>
          <div className="space-y-3">
            {googleCloud.map((item) => (
              <div
                key={item.name}
                className="rounded-xl border p-3.5 transition-colors hover:border-white/20"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <span className="text-lg mr-2">{item.icon}</span>
                <span className="text-sm font-medium">{item.name}</span>
                <p className="text-[11px] text-muted-foreground mt-1 ml-7">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Data Layer */}
        <div
          className="rounded-2xl border p-6"
          style={{
            background: "rgba(255,255,255,0.02)",
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          <span
            className="inline-block text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-md mb-4"
            style={{ background: "rgba(245,158,11,0.12)", color: "#FBBF24" }}
          >
            💾 Data Layer
          </span>
          <div className="space-y-3">
            {dataLayer.map((item) => (
              <div
                key={item.name}
                className="rounded-xl border p-3.5 transition-colors hover:border-white/20"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <span className="text-lg mr-2">{item.icon}</span>
                <span className="text-sm font-medium">{item.name}</span>
                <p className="text-[11px] text-muted-foreground mt-1 ml-7">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Workflow */}
      <div
        className="rounded-2xl border p-6 mb-6"
        style={{
          background: "rgba(255,255,255,0.02)",
          borderColor: "rgba(255,255,255,0.05)",
        }}
      >
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
          🔄 Plan-First Agentic Workflow
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {workflowSteps.map((step, i) => (
            <span key={i} className="contents">
              <span
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{
                  background: "rgba(99,102,241,0.1)",
                  color: "#A5B4FC",
                  border: "1px solid rgba(99,102,241,0.2)",
                }}
              >
                {step}
              </span>
              {i < workflowSteps.length - 1 && (
                <span className="text-muted-foreground text-sm">→</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Tech Summary */}
      <div
        className="rounded-2xl border p-6"
        style={{
          background: "rgba(99,102,241,0.03)",
          borderColor: "rgba(99,102,241,0.1)",
        }}
      >
        <h3 className="text-sm font-semibold mb-3">🏗️ Technology Summary</h3>
        <div className="grid md:grid-cols-2 gap-4 text-[13px] text-muted-foreground leading-relaxed">
          <div>
            <p className="font-medium text-foreground text-xs uppercase tracking-wider mb-2">AI & Agents</p>
            <ul className="space-y-1">
              <li>• Gemini 2.5 Flash (fast briefs) + Pro (schema gen)</li>
              <li>• Gemini Flash Image (mockups & assets)</li>
              <li>• Vertex AI — primary AI platform + Imagen 4.0</li>
              <li>• Agent Development Kit (ADK) — Google's agent framework</li>
              <li>• MCP Server with 25+ surgical tools</li>
              <li>• Multi-agent: Studio Agent + MCP Agent (ADK orchestrated)</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-foreground text-xs uppercase tracking-wider mb-2">Infrastructure</p>
            <ul className="space-y-1">
              <li>• Cloud Run (2 services: app + ADK agent)</li>
              <li>• Cloud Build (CI/CD with Docker)</li>
              <li>• Supabase (PostgreSQL + Auth + Storage)</li>
              <li>• TanStack Start (React SSR + streaming)</li>
              <li>• Multi-provider fallback: OpenAI, Anthropic, Groq</li>
            </ul>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
