/**
 * Plugin Registry — Extensible agent capabilities.
 *
 * Two plugin types:
 *   - Agent Plugin: Adds a new agent role with system prompt + tasks.
 *   - Hook Plugin: Injects into existing pipelines at lifecycle points.
 *
 * Lifecycle hooks:
 *   beforeGeneration  — Modify prompt before any agent runs
 *   afterAgent        — Process an agent's output before the next agent
 *   afterGeneration   — Post-process the final schema
 *   onChat            — Inject context into chat messages
 *   onExport          — Modify exported code
 *
 * Plugins are stored per-project in localStorage.
 */

import type { AgentRole, AgentDef } from "@/lib/agents";

// ─── Types ──────────────────────────────────────────────────────

export type PluginType = "agent" | "hook";

export type PluginHook =
  | "beforeGeneration"
  | "afterAgent"
  | "afterGeneration"
  | "onChat"
  | "onExport";

export type PluginAgentConfig = {
  /** The role ID (must be unique, snake_case) */
  role: string;
  /** Display name */
  name: string;
  /** Short description */
  short: string;
  /** Task chips shown in the UI */
  tasks: string[];
  /** System prompt sent to the AI */
  system: string;
  /** Emoji for the agent badge */
  emoji: string;
  /** Tailwind tint class */
  tint: string;
};

export type PluginHookHandler = {
  /** Which lifecycle point this hook fires at */
  hook: PluginHook;
  /** Description of what this hook does */
  description: string;
  /**
   * The system prompt injected when this hook fires.
   * For 'onChat' hooks, this is appended to the agent's system prompt.
   * For 'afterAgent' hooks, this becomes an additional AI call that
   * processes the agent's output.
   */
  prompt: string;
};

export type PluginManifest = {
  /** Unique plugin identifier (kebab-case) */
  id: string;
  /** Display name */
  name: string;
  /** Plugin description */
  description: string;
  /** Version string */
  version: string;
  /** Author name */
  author: string;
  /** Plugin type */
  type: PluginType;
  /** Emoji icon */
  icon: string;
  /** Category for filtering */
  category: "productivity" | "quality" | "design" | "analytics" | "i18n" | "security" | "custom";
  /** Whether this is a built-in plugin */
  builtIn: boolean;
  /** Agent configuration (only for agent plugins) */
  agent?: PluginAgentConfig;
  /** Hook configurations (only for hook plugins, can have multiple) */
  hooks?: PluginHookHandler[];
  /** Prompt templates for the agent chat */
  templates?: string[];
};

export type InstalledPlugin = {
  pluginId: string;
  enabled: boolean;
  installedAt: number;
  config?: Record<string, unknown>;
};

// ─── Built-in Plugins ───────────────────────────────────────────

export const BUILT_IN_PLUGINS: PluginManifest[] = [
  {
    id: "seo-analyzer",
    name: "ASO Optimizer",
    description: "Reviews app screens for App Store Optimization — titles, descriptions, keywords, and screenshots that rank.",
    version: "1.0.0",
    author: "Mobivable",
    type: "agent",
    icon: "🔍",
    category: "productivity",
    builtIn: true,
    agent: {
      role: "plugin_seo_analyzer",
      name: "ASO Optimizer",
      short: "Reviews app content for App Store discoverability and ranking.",
      tasks: ["ASO audit", "Keyword strategy", "Screenshot plan", "Description copy"],
      system: `You are an App Store Optimization (ASO) specialist. Given the app schema, analyze:

1. **App Store Listing**: Recommend title (30 chars), subtitle (30 chars), keyword field (100 chars), description (4000 chars outline)
2. **Screenshot Strategy**: For each key screen, recommend the marketing copy overlay and ordering (first 3 screenshots are critical)
3. **Search Keywords**: 10-15 high-volume, low-competition keywords for this app category
4. **Competitor Positioning**: How to differentiate in search results
5. **Rating Prompt Strategy**: When and where to trigger the native rating dialog

Output concise, actionable markdown. Under 400 words.`,
      emoji: "🔍",
      tint: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    },
    templates: [
      "Audit my app for App Store Optimization",
      "Generate App Store keywords for this app",
      "Write the App Store description copy",
    ],
  },
  {
    id: "i18n-generator",
    name: "i18n Generator",
    description: "Generates translation keys and locale files for multi-language support across all screens.",
    version: "1.0.0",
    author: "Mobivable",
    type: "hook",
    icon: "🌍",
    category: "i18n",
    builtIn: true,
    hooks: [
      {
        hook: "afterGeneration",
        description: "Extracts all user-visible strings and generates i18n translation keys",
        prompt: `You are an internationalization specialist. Given the app schema JSON, extract ALL user-visible strings (titles, labels, placeholders, button text, descriptions) and output a flat JSON translation file:

{
  "screen.home.greeting": "Good morning",
  "screen.home.subtitle": "Your daily summary",
  "button.continue": "Continue",
  ...
}

Rules:
- Use dot-notation keys: screen.{screenId}.{elementType}.{purpose}
- Include every string that a user would see
- Group by screen, then by element
- Output ONLY the JSON translation map

Under 200 keys.`,
      },
      {
        hook: "onChat",
        description: "Reminds agents to use translation keys instead of hardcoded strings",
        prompt: "When generating or modifying UI text, always suggest using i18n translation keys (e.g., t('screen.home.title')) instead of hardcoded strings. Note which strings need translation.",
      },
    ],
    templates: [
      "Extract all translatable strings from my app",
      "Generate Spanish translations for my app",
      "Add RTL language support recommendations",
    ],
  },
  {
    id: "accessibility-checker",
    name: "Accessibility Checker",
    description: "Audits WCAG 2.1 AA compliance for mobile — contrast, touch targets, screen readers, and motion.",
    version: "1.0.0",
    author: "Mobivable",
    type: "agent",
    icon: "♿",
    category: "quality",
    builtIn: true,
    agent: {
      role: "plugin_accessibility",
      name: "Accessibility Auditor",
      short: "Audits app for WCAG 2.1 AA mobile compliance.",
      tasks: ["Contrast audit", "Touch targets", "Screen reader", "Motion sensitivity"],
      system: `You are a mobile accessibility specialist (WCAG 2.1 AA). Given the app schema, audit:

1. **Color Contrast**: Check theme colors against WCAG AA minimums (4.5:1 text, 3:1 large text). Flag specific violations with hex values.
2. **Touch Targets**: All interactive elements must be ≥44×44pt. Flag buttons, toggles, and links that may be too small.
3. **Screen Reader**: For each screen, list elements that need: accessibilityLabel, accessibilityHint, accessibilityRole. Flag images without alt text.
4. **Motion & Animation**: Flag entrance animations that need reduced-motion alternatives. Check for auto-playing content.
5. **Navigation**: Verify logical tab order, focus management on screen transitions, and back button handling.
6. **Score**: Rate overall accessibility 1-10 with specific improvements.

Output a structured audit report in markdown. Under 400 words.`,
      emoji: "♿",
      tint: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    },
    templates: [
      "Run a full accessibility audit on my app",
      "Check color contrast ratios across all screens",
      "Generate screen reader labels for all elements",
    ],
  },
  {
    id: "app-analytics",
    name: "Analytics Planner",
    description: "Recommends event tracking, funnels, and KPI dashboards for every screen and user flow.",
    version: "1.0.0",
    author: "Mobivable",
    type: "agent",
    icon: "📊",
    category: "analytics",
    builtIn: true,
    agent: {
      role: "plugin_analytics",
      name: "Analytics Planner",
      short: "Plans event tracking and KPI measurement for every screen.",
      tasks: ["Event taxonomy", "Funnel design", "KPI dashboard", "A/B test plan"],
      system: `You are a mobile analytics specialist. Given the app schema, produce:

1. **Event Taxonomy**: For each screen, list 3-5 events to track as a table:
   | Event Name | Trigger | Properties | Priority |
   | screen_view.home | Screen mount | screen_name, user_type | P0 |
   | button_tap.send_money | Tap "Send Money" | amount, currency | P0 |

2. **Funnels**: Define 2-3 critical funnels (e.g., Onboarding → Home → First Action)
3. **KPIs**: 5 key metrics with targets (DAU, retention D1/D7/D30, conversion, session length, feature adoption)
4. **A/B Tests**: 2-3 recommended experiments with hypothesis and success metric
5. **Implementation**: Recommend analytics SDK (Mixpanel, Amplitude, PostHog) with reasoning

Under 400 words.`,
      emoji: "📊",
      tint: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    },
    templates: [
      "Design an event tracking plan for my app",
      "Define the key funnels and conversion metrics",
      "Recommend A/B tests for the onboarding flow",
    ],
  },
  {
    id: "dark-mode-validator",
    name: "Dark Mode Validator",
    description: "Validates contrast ratios, readability, and visual consistency in dark theme configurations.",
    version: "1.0.0",
    author: "Mobivable",
    type: "hook",
    icon: "🌙",
    category: "design",
    builtIn: true,
    hooks: [
      {
        hook: "afterAgent",
        description: "After the UI Designer agent runs, validates dark mode color choices",
        prompt: `Review the UI Designer's output for dark mode issues:
1. Check that background colors are dark enough (#0a-#1a range) without being pure black (#000)
2. Verify text-on-background contrast meets 4.5:1 WCAG AA
3. Check that card/surface colors have sufficient elevation distinction from background
4. Ensure primary/accent colors aren't too saturated for dark backgrounds (suggest desaturated variants)
5. Flag any light-mode-only color choices (e.g., light gray text on dark background)

Output specific hex-value fixes for any issues found.`,
      },
    ],
    templates: [
      "Validate dark mode colors across all screens",
      "Fix contrast issues in my dark theme",
      "Suggest a better dark mode color palette",
    ],
  },
];

// ─── Registry Class ─────────────────────────────────────────────

const STORAGE_KEY = (projectId: string) => `mobivable:plugins:${projectId}`;

export class PluginRegistry {
  private manifests: Map<string, PluginManifest> = new Map();
  private installed: Map<string, InstalledPlugin> = new Map();
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;

    // Register all built-in plugins
    for (const plugin of BUILT_IN_PLUGINS) {
      this.manifests.set(plugin.id, plugin);
    }

    // Load installed state from localStorage
    this.loadInstalled();
  }

  // ─── Persistence ────────────────────────────────────────────

  private loadInstalled(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY(this.projectId));
      if (raw) {
        const items: InstalledPlugin[] = JSON.parse(raw);
        for (const item of items) {
          this.installed.set(item.pluginId, item);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  private saveInstalled(): void {
    if (typeof window === "undefined") return;
    const items = Array.from(this.installed.values());
    window.localStorage.setItem(STORAGE_KEY(this.projectId), JSON.stringify(items));
  }

  // ─── Plugin Management ──────────────────────────────────────

  /** Register a new plugin manifest (for custom plugins) */
  registerPlugin(manifest: PluginManifest): void {
    this.manifests.set(manifest.id, manifest);
  }

  /** Unregister a plugin manifest (removes the definition entirely) */
  unregisterPlugin(pluginId: string): void {
    const manifest = this.manifests.get(pluginId);
    if (manifest?.builtIn) return; // Can't remove built-in plugins
    this.manifests.delete(pluginId);
    this.installed.delete(pluginId);
    this.saveInstalled();
  }

  /** Install (enable) a plugin for this project */
  installPlugin(pluginId: string): boolean {
    if (!this.manifests.has(pluginId)) return false;
    this.installed.set(pluginId, {
      pluginId,
      enabled: true,
      installedAt: Date.now(),
    });
    this.saveInstalled();
    return true;
  }

  /** Uninstall (disable) a plugin */
  uninstallPlugin(pluginId: string): void {
    this.installed.delete(pluginId);
    this.saveInstalled();
  }

  /** Toggle a plugin's enabled state */
  togglePlugin(pluginId: string): boolean {
    const inst = this.installed.get(pluginId);
    if (!inst) return false;
    inst.enabled = !inst.enabled;
    this.saveInstalled();
    return inst.enabled;
  }

  /** Check if a plugin is installed and enabled */
  isActive(pluginId: string): boolean {
    const inst = this.installed.get(pluginId);
    return !!inst?.enabled;
  }

  // ─── Queries ────────────────────────────────────────────────

  /** Get all registered plugin manifests */
  getAllPlugins(): PluginManifest[] {
    return Array.from(this.manifests.values());
  }

  /** Get all installed plugins with their manifests */
  getInstalledPlugins(): Array<PluginManifest & { installed: InstalledPlugin }> {
    const result: Array<PluginManifest & { installed: InstalledPlugin }> = [];
    for (const [id, inst] of this.installed) {
      const manifest = this.manifests.get(id);
      if (manifest) {
        result.push({ ...manifest, installed: inst });
      }
    }
    return result;
  }

  /** Get active (installed + enabled) plugins */
  getActivePlugins(): PluginManifest[] {
    return this.getAllPlugins().filter((p) => this.isActive(p.id));
  }

  /** Get plugins by type */
  getPluginsByType(type: PluginType): PluginManifest[] {
    return this.getAllPlugins().filter((p) => p.type === type);
  }

  /** Get plugins by category */
  getPluginsByCategory(category: PluginManifest["category"]): PluginManifest[] {
    return this.getAllPlugins().filter((p) => p.category === category);
  }

  // ─── Agent Extension ────────────────────────────────────────

  /** Get agent definitions from all active agent plugins */
  getPluginAgents(): AgentDef[] {
    const agents: AgentDef[] = [];
    for (const plugin of this.getActivePlugins()) {
      if (plugin.type === "agent" && plugin.agent) {
        agents.push({
          role: plugin.agent.role as AgentRole,
          name: plugin.agent.name,
          short: plugin.agent.short,
          tasks: plugin.agent.tasks,
          system: plugin.agent.system,
        });
      }
    }
    return agents;
  }

  /** Get agent badges from all active agent plugins */
  getPluginBadges(): Record<string, { emoji: string; tint: string }> {
    const badges: Record<string, { emoji: string; tint: string }> = {};
    for (const plugin of this.getActivePlugins()) {
      if (plugin.type === "agent" && plugin.agent) {
        badges[plugin.agent.role] = {
          emoji: plugin.agent.emoji,
          tint: plugin.agent.tint,
        };
      }
    }
    return badges;
  }

  /** Get agent chat templates from all active plugins */
  getPluginTemplates(): Record<string, string[]> {
    const templates: Record<string, string[]> = {};
    for (const plugin of this.getActivePlugins()) {
      if (plugin.type === "agent" && plugin.agent && plugin.templates) {
        templates[plugin.agent.role] = plugin.templates;
      }
    }
    return templates;
  }

  // ─── Hook Execution ─────────────────────────────────────────

  /** Get all hook handlers for a given lifecycle point */
  getHooksForEvent(hook: PluginHook): Array<{ plugin: PluginManifest; handler: PluginHookHandler }> {
    const result: Array<{ plugin: PluginManifest; handler: PluginHookHandler }> = [];
    for (const plugin of this.getActivePlugins()) {
      if (plugin.hooks) {
        for (const handler of plugin.hooks) {
          if (handler.hook === hook) {
            result.push({ plugin, handler });
          }
        }
      }
    }
    return result;
  }

  /** Build a combined system prompt suffix from all onChat hooks */
  getChatHookPrompts(): string {
    const hooks = this.getHooksForEvent("onChat");
    if (hooks.length === 0) return "";
    return (
      "\n\n--- ACTIVE PLUGIN INSTRUCTIONS ---\n" +
      hooks
        .map((h) => `[${h.plugin.name}]: ${h.handler.prompt}`)
        .join("\n\n")
    );
  }

  /** Get all afterAgent hook prompts (to run as additional AI calls) */
  getAfterAgentHooks(): Array<{ pluginName: string; prompt: string }> {
    return this.getHooksForEvent("afterAgent").map((h) => ({
      pluginName: h.plugin.name,
      prompt: h.handler.prompt,
    }));
  }

  /** Get all afterGeneration hook prompts */
  getAfterGenerationHooks(): Array<{ pluginName: string; prompt: string }> {
    return this.getHooksForEvent("afterGeneration").map((h) => ({
      pluginName: h.plugin.name,
      prompt: h.handler.prompt,
    }));
  }

  /** Get all beforeGeneration hook prompts */
  getBeforeGenerationHooks(): Array<{ pluginName: string; prompt: string }> {
    return this.getHooksForEvent("beforeGeneration").map((h) => ({
      pluginName: h.plugin.name,
      prompt: h.handler.prompt,
    }));
  }
}

// ─── Factory ────────────────────────────────────────────────────

/** Create a new PluginRegistry for a project */
export function createPluginRegistry(projectId: string): PluginRegistry {
  return new PluginRegistry(projectId);
}

/** Create a custom agent plugin manifest from user input */
export function createCustomAgentPlugin(args: {
  name: string;
  description: string;
  emoji: string;
  systemPrompt: string;
  tasks: string[];
  templates?: string[];
}): PluginManifest {
  const id = `custom-${args.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const role = `plugin_${id.replace(/-/g, "_")}`;

  return {
    id,
    name: args.name,
    description: args.description,
    version: "1.0.0",
    author: "User",
    type: "agent",
    icon: args.emoji,
    category: "custom",
    builtIn: false,
    agent: {
      role,
      name: args.name,
      short: args.description.slice(0, 80),
      tasks: args.tasks,
      system: args.systemPrompt,
      emoji: args.emoji,
      tint: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
    },
    templates: args.templates,
  };
}

/** Create a custom hook plugin manifest from user input */
export function createCustomHookPlugin(args: {
  name: string;
  description: string;
  emoji: string;
  hooks: Array<{ hook: PluginHook; description: string; prompt: string }>;
}): PluginManifest {
  const id = `custom-hook-${args.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  return {
    id,
    name: args.name,
    description: args.description,
    version: "1.0.0",
    author: "User",
    type: "hook",
    icon: args.emoji,
    category: "custom",
    builtIn: false,
    hooks: args.hooks,
  };
}
