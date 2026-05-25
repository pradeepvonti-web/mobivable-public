import { useState, useCallback, useEffect } from "react";
import {
  LayoutGrid,
  Search,
  Star,
  Users,
  Rocket,
  ChevronRight,
  X,
  Loader2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { listTemplates, getTemplate, createProjectFromTemplate } from "@/lib/templates.functions";
import type { TemplateSummary, TemplateDetail } from "@/lib/templates.functions";

/* ─── Category colours ──────────────────────────────────────── */

const CATEGORY_COLORS: Record<string, string> = {
  social: "#6366f1",
  "e-commerce": "#f59e0b",
  health: "#10b981",
  finance: "#3b82f6",
  productivity: "#8b5cf6",
  food: "#ef4444",
  education: "#06b6d4",
  travel: "#ec4899",
  fitness: "#22c55e",
};

const CATEGORIES = [
  "All",
  "Social",
  "E-Commerce",
  "Health",
  "Finance",
  "Productivity",
  "Food",
  "Education",
  "Travel",
  "Fitness",
] as const;

function categoryKey(label: string): string {
  return label.toLowerCase();
}

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category.toLowerCase()] ?? "#6366f1";
}

/* ─── Props ─────────────────────────────────────────────────── */

interface TemplateGalleryProps {
  onSelect: (projectId: string) => void;
  onClose: () => void;
}

/* ─── Component ─────────────────────────────────────────────── */

export default function TemplateGallery({ onSelect, onClose }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Detail modal state
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  /* ── Fetch templates ─────────────────────────────────────── */

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const categoryFilter =
        activeCategory === "All" ? undefined : categoryKey(activeCategory);
      const data = await listTemplates({ data: { category: categoryFilter } });
      setTemplates(data);
    } catch (e) {
      console.error("Failed to fetch templates:", e);
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  /* ── Filtered templates ──────────────────────────────────── */

  const filtered = templates.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description?.toLowerCase().includes(q) ?? false) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
      t.category.toLowerCase().includes(q)
    );
  });

  /* ── Open detail ─────────────────────────────────────────── */

  const openDetail = async (templateId: string) => {
    setDetailLoading(true);
    try {
      const detail = await getTemplate({ data: { templateId } });
      setSelectedTemplate(detail);
      setProjectName(detail.name);
    } catch (e) {
      toast.error("Failed to load template details");
    } finally {
      setDetailLoading(false);
    }
  };

  /* ── Create project ──────────────────────────────────────── */

  const handleCreate = async () => {
    if (!selectedTemplate || !projectName.trim()) return;
    setCreating(true);
    try {
      const result = await createProjectFromTemplate({
        data: {
          templateId: selectedTemplate.id,
          projectName: projectName.trim(),
        },
      });
      toast.success(`Project "${projectName.trim()}" created!`);
      onSelect(result.projectId);
    } catch (e) {
      toast.error("Failed to create project from template");
    } finally {
      setCreating(false);
    }
  };

  /* ── Render ──────────────────────────────────────────────── */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
              <LayoutGrid className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold">
                Template Gallery
              </h2>
              <p className="text-xs text-muted-foreground">
                Start with a pre-built app template
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
          >
            Close
          </button>
        </header>

        {/* Category filter + Search */}
        <div className="flex flex-col gap-3 px-5 py-4 border-b border-border shrink-0">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Category chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat;
              const color =
                cat === "All" ? "#6366f1" : getCategoryColor(categoryKey(cat));
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap"
                  style={
                    isActive
                      ? {
                          background: color,
                          color: "#fff",
                          boxShadow: `0 2px 8px ${color}44`,
                        }
                      : {
                          background: `${color}15`,
                          color: color,
                        }
                  }
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Loading templates…
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <LayoutGrid className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No templates match your filters
              </p>
              <button
                onClick={() => {
                  setActiveCategory("All");
                  setSearchQuery("");
                }}
                className="text-xs text-primary hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  onOpen={() => openDetail(tpl.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail loading overlay */}
      {detailLoading && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      )}

      {/* Detail modal */}
      {selectedTemplate && (
        <TemplateDetailModal
          template={selectedTemplate}
          projectName={projectName}
          onProjectNameChange={setProjectName}
          onClose={() => {
            setSelectedTemplate(null);
            setProjectName("");
          }}
          onCreate={handleCreate}
          creating={creating}
        />
      )}
    </div>
  );
}

/* ─── Template Card ─────────────────────────────────────────── */

function TemplateCard({
  template,
  onOpen,
}: {
  template: TemplateSummary;
  onOpen: () => void;
}) {
  const color = getCategoryColor(template.category);
  const features = template.feature_list.slice(0, 3);

  return (
    <button
      onClick={onOpen}
      className="group relative flex flex-col rounded-xl border border-border bg-card/60 overflow-hidden text-left transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      {/* Gradient header */}
      <div
        className="h-24 w-full relative"
        style={{
          background: `linear-gradient(135deg, ${color}30, ${color}10)`,
        }}
      >
        {/* Featured badge */}
        {template.is_featured && (
          <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-semibold">
            <Star className="w-3 h-3" fill="currentColor" />
            Featured
          </span>
        )}

        {/* Category badge */}
        <span
          className="absolute bottom-2 left-3 px-2 py-0.5 rounded-full text-[10px] font-medium"
          style={{ background: `${color}25`, color }}
        >
          {template.category}
        </span>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2 p-4 flex-1">
        <h3 className="text-sm font-semibold font-display group-hover:text-primary transition-colors">
          {template.name}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {template.description}
        </p>

        {/* Features */}
        {features.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {features.map((f) => (
              <span
                key={f}
                className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
              >
                {f}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Users className="w-3 h-3" />
            {template.use_count} uses
          </span>
          <span className="flex items-center gap-1 text-[10px] text-primary font-medium group-hover:gap-2 transition-all">
            Use Template
            <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </button>
  );
}

/* ─── Template Detail Modal ─────────────────────────────────── */

function TemplateDetailModal({
  template,
  projectName,
  onProjectNameChange,
  onClose,
  onCreate,
  creating,
}: {
  template: TemplateDetail;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onClose: () => void;
  onCreate: () => void;
  creating: boolean;
}) {
  const color = getCategoryColor(template.category);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-lg mx-4 max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header gradient */}
        <div
          className="h-28 w-full relative shrink-0"
          style={{
            background: `linear-gradient(135deg, ${color}40, ${color}15)`,
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-card/80 hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="absolute bottom-3 left-4 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${color}30` }}
            >
              <Zap className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold">
                {template.name}
              </h2>
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{ background: `${color}25`, color }}
              >
                {template.category}
              </span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {template.description}
          </p>

          {/* Features */}
          {template.feature_list.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Rocket className="w-3.5 h-3.5 text-primary" />
                Features
              </h4>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {template.feature_list.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {template.use_count} uses
            </span>
            {template.is_featured && (
              <span className="flex items-center gap-1 text-amber-400">
                <Star className="w-3.5 h-3.5" fill="currentColor" />
                Featured
              </span>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Project name input */}
          <div>
            <label
              htmlFor="template-project-name"
              className="block text-xs font-medium text-foreground mb-1.5"
            >
              Project Name
            </label>
            <input
              id="template-project-name"
              type="text"
              value={projectName}
              onChange={(e) => onProjectNameChange(e.target.value)}
              placeholder="My Awesome App"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border shrink-0">
          <button
            onClick={onCreate}
            disabled={creating || !projectName.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: creating
                ? `${color}80`
                : `linear-gradient(135deg, ${color}, ${color}cc)`,
              boxShadow: creating ? "none" : `0 4px 12px ${color}40`,
            }}
          >
            {creating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating Project…
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4" />
                Create Project
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
