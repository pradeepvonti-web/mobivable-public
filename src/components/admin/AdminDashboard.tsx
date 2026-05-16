import { useState } from "react";
import { AdminOverview } from "./AdminOverview";
import { AdminUsers } from "./AdminUsers";
import { AdminProjects } from "./AdminProjects";
import { AdminAIConfig } from "./AdminAIConfig";
import { AdminFeatureFlags } from "./AdminFeatureFlags";
import { AdminPayments } from "./AdminPayments";
import { AdminActivity } from "./AdminActivity";
import { ThemeToggle } from "@/components/theme-toggle";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "projects", label: "Projects" },
  { id: "payments", label: "Payments" },
  { id: "ai", label: "AI Providers" },
  { id: "features", label: "Feature Control" },
  { id: "activity", label: "Activity" },
] as const;


type TabId = (typeof TABS)[number]["id"];

export function AdminDashboard() {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-[1440px] flex items-center gap-4 px-6 h-16">
          <div className="flex items-center gap-2.5">
            <div className="size-6 bg-primary rounded-sm" />
            <div>
              <h1 className="font-display text-2xl tracking-tighter uppercase leading-none">Mobivable</h1>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mt-0.5">Admin Dashboard</p>
            </div>
          </div>
          <div className="flex-1" />
          <ThemeToggle />
          <a href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Back to App
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] flex min-h-[calc(100vh-64px)]">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-border bg-card/30 p-3 gap-1">
          {TABS.map(({ id, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-all ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <span className={`size-3 rounded-sm shrink-0 ${active ? "bg-primary" : "bg-muted-foreground/40"}`} />
                {label}
              </button>
            );
          })}
        </aside>

        {/* Mobile tabs */}
        <div className="lg:hidden flex border-b border-border bg-card/30 overflow-x-auto w-full fixed top-16 z-30">
          {TABS.map(({ id, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground"
                }`}
              >
                <span className={`size-2.5 rounded-sm shrink-0 ${active ? "bg-primary" : "bg-muted-foreground/40"}`} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          {tab === "overview" && <AdminOverview />}
          {tab === "users" && <AdminUsers />}
          {tab === "projects" && <AdminProjects />}
          {tab === "payments" && <AdminPayments />}
          {tab === "ai" && <AdminAIConfig />}
          {tab === "features" && <AdminFeatureFlags />}
          {tab === "activity" && <AdminActivity />}
        </main>
      </div>
    </div>
  );
}
