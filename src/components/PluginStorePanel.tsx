import { useState, useCallback, useMemo } from "react";
import {
  Puzzle,
  X,
  Search,
  Plus,
  Check,
  Download,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  Zap,
  Bot,
  Anchor,
  Loader2,
  Sparkles,
  Tag,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import {
  type PluginManifest,
  type PluginType,
  BUILT_IN_PLUGINS,
  createPluginRegistry,
  createCustomAgentPlugin,
} from "@/lib/plugin-registry";

// ─── Category config ────────────────────────────────────────────

type CategoryFilter = "all" | "agent" | "hook" | "built-in" | "custom" | PluginManifest["category"];

const CATEGORY_CHIPS: { id: CategoryFilter; label: string; icon: React.ReactNode }[] = [
  { id: "all", label: "All", icon: <Puzzle className="h-3 w-3" /> },
  { id: "agent", label: "Agents", icon: <Bot className="h-3 w-3" /> },
  { id: "hook", label: "Hooks", icon: <Anchor className="h-3 w-3" /> },
  { id: "built-in", label: "Built-in", icon: <Sparkles className="h-3 w-3" /> },
  { id: "custom", label: "Custom", icon: <Tag className="h-3 w-3" /> },
];

const TYPE_BADGE: Record<PluginType, { label: string; class: string }> = {
  agent: { label: "Agent", class: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  hook: { label: "Hook", class: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

// ─── Plugin Card ────────────────────────────────────────────────

function PluginCard({
  plugin,
  active,
  onInstall,
  onUninstall,
  onToggle,
  onExpand,
}: {
  plugin: PluginManifest;
  active: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onToggle: () => void;
  onExpand: () => void;
}) {
  return (
    <div
      className={`rounded-xl border p-3 transition-all ${
        active
          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
          : "border-border bg-card/30 hover:bg-card/50"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="h-10 w-10 rounded-xl bg-muted/20 grid place-items-center text-xl shrink-0 border border-border/40">
          {plugin.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{plugin.name}</span>
            <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full border ${TYPE_BADGE[plugin.type].class}`}>
              {TYPE_BADGE[plugin.type].label}
            </span>
            {plugin.builtIn && (
              <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border/40">
                built-in
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
            {plugin.description}
          </p>

          {/* Details button */}
          <button
            type="button"
            onClick={onExpand}
            className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-primary hover:text-primary/80 mt-1.5 transition-colors"
          >
            Details <ChevronRight className="h-2.5 w-2.5" />
          </button>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          {active ? (
            <>
              <button
                type="button"
                onClick={onToggle}
                className="h-7 px-2 rounded-md text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors flex items-center gap-1"
              >
                <Check className="h-3 w-3" /> Active
              </button>
              {!plugin.builtIn && (
                <button
                  type="button"
                  onClick={onUninstall}
                  className="h-5 text-[9px] text-muted-foreground hover:text-red-400 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="h-2.5 w-2.5" /> Remove
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onInstall}
              className="h-7 px-2.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors flex items-center gap-1"
            >
              <Download className="h-3 w-3" /> Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Plugin Detail View ─────────────────────────────────────────

function PluginDetail({
  plugin,
  active,
  onBack,
  onInstall,
  onUninstall,
}: {
  plugin: PluginManifest;
  active: boolean;
  onBack: () => void;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors px-4 pt-3"
      >
        <ArrowLeft className="h-3 w-3" /> Back to plugins
      </button>

      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="h-14 w-14 rounded-2xl bg-muted/20 grid place-items-center text-2xl shrink-0 border border-border/40">
            {plugin.icon}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground">{plugin.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full border ${TYPE_BADGE[plugin.type].class}`}>
                {TYPE_BADGE[plugin.type].label}
              </span>
              <span className="text-[9px] text-muted-foreground">v{plugin.version}</span>
              <span className="text-[9px] text-muted-foreground">by {plugin.author}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {plugin.description}
            </p>
          </div>
        </div>

        {/* Install/Uninstall */}
        <div>
          {active ? (
            <button
              type="button"
              onClick={onUninstall}
              className="w-full py-2 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="h-3.5 w-3.5" /> Uninstall Plugin
            </button>
          ) : (
            <button
              type="button"
              onClick={onInstall}
              className="w-full py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <Download className="h-3.5 w-3.5" /> Install Plugin
            </button>
          )}
        </div>

        {/* Agent config */}
        {plugin.agent && (
          <div className="rounded-xl border border-border bg-card/30 p-3 space-y-2">
            <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Agent Configuration</h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Role</span>
                <code className="text-[9px] bg-muted/30 px-1.5 py-0.5 rounded font-mono">{plugin.agent.role}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tasks</span>
                <span className="text-foreground">{plugin.agent.tasks.length}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {plugin.agent.tasks.map((t) => (
                <span key={t} className="text-[8px] font-mono bg-muted/20 border border-border/40 px-1.5 py-0.5 rounded-full text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Hooks */}
        {plugin.hooks && plugin.hooks.length > 0 && (
          <div className="rounded-xl border border-border bg-card/30 p-3 space-y-2">
            <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Lifecycle Hooks</h4>
            <div className="space-y-2">
              {plugin.hooks.map((hook, i) => (
                <div key={i} className="rounded-lg border border-border/40 bg-background/40 p-2.5">
                  <div className="flex items-center gap-2">
                    <Zap className="h-3 w-3 text-amber-400" />
                    <code className="text-[9px] font-mono text-amber-400">{hook.hook}</code>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                    {hook.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Templates */}
        {plugin.templates && plugin.templates.length > 0 && (
          <div className="rounded-xl border border-border bg-card/30 p-3 space-y-2">
            <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Chat Templates</h4>
            <div className="space-y-1">
              {plugin.templates.map((t, i) => (
                <div key={i} className="text-[10px] text-muted-foreground flex items-start gap-2">
                  <span className="text-primary shrink-0">→</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* System prompt (collapsed) */}
        {plugin.agent?.system && (
          <details className="rounded-xl border border-border bg-card/30 overflow-hidden">
            <summary className="px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-2">
              <ChevronDown className="h-3 w-3" /> System Prompt
            </summary>
            <pre className="px-3 pb-3 text-[9px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {plugin.agent.system}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

// ─── Create Plugin Form ─────────────────────────────────────────

function CreatePluginForm({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (plugin: PluginManifest) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🔌");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tasksStr, setTasksStr] = useState("");
  const [templatesStr, setTemplatesStr] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) {
      toast.error("Name and system prompt are required");
      return;
    }

    const tasks = tasksStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const templates = templatesStr
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);

    const plugin = createCustomAgentPlugin({
      name: name.trim(),
      description: description.trim() || `Custom agent: ${name.trim()}`,
      emoji: emoji || "🔌",
      systemPrompt: systemPrompt.trim(),
      tasks: tasks.length > 0 ? tasks : ["Custom task"],
      templates: templates.length > 0 ? templates : undefined,
    });

    onCreate(plugin);
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors px-4 pt-3"
      >
        <ArrowLeft className="h-3 w-3" /> Back
      </button>

      <div className="p-4 space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          Create Agent Plugin
        </h3>

        {/* Name + Emoji */}
        <div className="flex gap-2">
          <div className="w-16">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">Icon</label>
            <input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={2}
              className="w-full h-9 rounded-lg border border-border bg-background/60 px-2 text-center text-xl focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Marketing Copywriter"
              maxLength={40}
              className="w-full h-9 rounded-lg border border-border bg-background/60 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this agent does..."
            maxLength={120}
            className="w-full h-9 rounded-lg border border-border bg-background/60 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
          />
        </div>

        {/* System Prompt */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">System Prompt *</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a senior... Given the app, produce:&#10;1. ...&#10;2. ..."
            maxLength={4000}
            rows={8}
            className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 resize-none"
          />
          <div className="text-[9px] text-muted-foreground/50 text-right mt-0.5">
            {systemPrompt.length}/4000
          </div>
        </div>

        {/* Tasks */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">Tasks (comma-separated)</label>
          <input
            type="text"
            value={tasksStr}
            onChange={(e) => setTasksStr(e.target.value)}
            placeholder="e.g., Copy audit, Headlines, CTA optimization"
            className="w-full h-9 rounded-lg border border-border bg-background/60 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Templates */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">Chat Templates (one per line)</label>
          <textarea
            value={templatesStr}
            onChange={(e) => setTemplatesStr(e.target.value)}
            placeholder="Write marketing copy for my app&#10;Optimize the onboarding CTA&#10;Review button labels for clarity"
            rows={3}
            className="w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 resize-none"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!name.trim() || !systemPrompt.trim()}
          className="w-full py-2.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" /> Create Plugin
        </button>
      </div>
    </form>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────

export function PluginStorePanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [registry] = useState(() => createPluginRegistry(projectId));
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedPlugin, setExpandedPlugin] = useState<PluginManifest | null>(null);
  const [creating, setCreating] = useState(false);
  const [, setTick] = useState(0); // Force re-render on state change
  const forceUpdate = () => setTick((t) => t + 1);

  // Filter plugins
  const plugins = useMemo(() => {
    let list = registry.getAllPlugins();

    // Apply category filter
    if (filter === "agent") list = list.filter((p) => p.type === "agent");
    else if (filter === "hook") list = list.filter((p) => p.type === "hook");
    else if (filter === "built-in") list = list.filter((p) => p.builtIn);
    else if (filter === "custom") list = list.filter((p) => !p.builtIn);
    else if (filter !== "all") list = list.filter((p) => p.category === filter);

    // Apply search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      );
    }

    return list;
  }, [registry, filter, search]);

  const activeCount = registry.getActivePlugins().length;

  const handleInstall = useCallback(
    (pluginId: string) => {
      registry.installPlugin(pluginId);
      toast.success("Plugin installed");
      forceUpdate();
    },
    [registry],
  );

  const handleUninstall = useCallback(
    (pluginId: string) => {
      registry.uninstallPlugin(pluginId);
      toast("Plugin uninstalled");
      setExpandedPlugin(null);
      forceUpdate();
    },
    [registry],
  );

  const handleToggle = useCallback(
    (pluginId: string) => {
      const enabled = registry.togglePlugin(pluginId);
      toast(enabled ? "Plugin enabled" : "Plugin disabled");
      forceUpdate();
    },
    [registry],
  );

  const handleCreatePlugin = useCallback(
    (plugin: PluginManifest) => {
      registry.registerPlugin(plugin);
      registry.installPlugin(plugin.id);
      setCreating(false);
      toast.success(`Plugin "${plugin.name}" created and installed!`);
      forceUpdate();
    },
    [registry],
  );

  // ─── Detail view ──────────────────────────────────────────

  if (expandedPlugin) {
    return (
      <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
        <header className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 grid place-items-center shrink-0 shadow-sm">
              <Puzzle className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="font-display text-sm uppercase tracking-tight">Plugin Details</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <PluginDetail
          plugin={expandedPlugin}
          active={registry.isActive(expandedPlugin.id)}
          onBack={() => setExpandedPlugin(null)}
          onInstall={() => { handleInstall(expandedPlugin.id); forceUpdate(); }}
          onUninstall={() => handleUninstall(expandedPlugin.id)}
        />
      </section>
    );
  }

  // ─── Create form ──────────────────────────────────────────

  if (creating) {
    return (
      <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
        <header className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 grid place-items-center shrink-0 shadow-sm">
              <Puzzle className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="font-display text-sm uppercase tracking-tight">Create Plugin</h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <CreatePluginForm onCancel={() => setCreating(false)} onCreate={handleCreatePlugin} />
      </section>
    );
  }

  // ─── Main list view ───────────────────────────────────────

  return (
    <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
      {/* Header */}
      <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 grid place-items-center shrink-0 shadow-sm">
            <Puzzle className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-sm uppercase tracking-tight">Plugin Store</h2>
            <p className="text-[9px] text-muted-foreground font-mono uppercase tracking-widest">
              {activeCount} active · {plugins.length} available
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="h-7 px-2.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Create
          </button>
          <button type="button" onClick={onClose} className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plugins..."
            className="w-full h-8 rounded-lg border border-border bg-background/60 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Category filters */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {CATEGORY_CHIPS.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setFilter(cat.id)}
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors ${
              filter === cat.id
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-card/30 text-muted-foreground border-border hover:text-foreground hover:border-primary/20"
            }`}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}
      </div>

      {/* Plugin list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        {plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="h-12 w-12 rounded-xl bg-muted/10 grid place-items-center">
              <Puzzle className="h-6 w-6 text-muted-foreground/30" />
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground/60">No plugins found</p>
              <p className="text-[10px] text-muted-foreground/40 mt-1">
                Try a different filter or create a custom plugin
              </p>
            </div>
          </div>
        ) : (
          plugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              active={registry.isActive(plugin.id)}
              onInstall={() => handleInstall(plugin.id)}
              onUninstall={() => handleUninstall(plugin.id)}
              onToggle={() => handleToggle(plugin.id)}
              onExpand={() => setExpandedPlugin(plugin)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-1.5 flex items-center justify-between text-[9px] font-mono bg-[#0d0d15]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="flex items-center gap-1">
            <Puzzle className="h-3 w-3" />
            Plugin Store
          </span>
          <span className="text-muted-foreground/40">|</span>
          <span>Extend agent capabilities</span>
        </div>
        <div className="text-muted-foreground/50">
          Per-project plugins
        </div>
      </div>
    </section>
  );
}
