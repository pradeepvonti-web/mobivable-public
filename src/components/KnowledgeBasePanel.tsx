import { useState } from "react";
import { BookOpen, Plus, Search, Trash2, Edit3, Save, X, FileText, Link2, Tag, Clock } from "lucide-react";
import { toast } from "sonner";

type KBEntry = { id: string; title: string; content: string; tags: string[]; updatedAt: string; type: "note" | "snippet" | "link" };

const SEED_ENTRIES: KBEntry[] = [
  { id: "1", title: "App Color Palette", content: "Primary: #8B5CF6, Secondary: #F59E0B, Background: #1A1D21, Surface: #2C3138", tags: ["design", "colors"], updatedAt: "2 min ago", type: "note" },
  { id: "2", title: "Supabase RLS Policy", content: "CREATE POLICY \"Users read own data\" ON profiles FOR SELECT USING (auth.uid() = user_id);", tags: ["backend", "security"], updatedAt: "1 hour ago", type: "snippet" },
  { id: "3", title: "Expo Push Notification Docs", content: "https://docs.expo.dev/push-notifications/overview/", tags: ["reference", "notifications"], updatedAt: "3 hours ago", type: "link" },
  { id: "4", title: "Navigation Structure", content: "Tab Navigator: Home, Search, Profile, Settings. Stack: Auth (Login, Signup, Forgot), Onboarding (4 steps)", tags: ["architecture", "navigation"], updatedAt: "1 day ago", type: "note" },
];

export function KnowledgeBasePanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [entries, setEntries] = useState<KBEntry[]>(SEED_ENTRIES);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", tags: "", type: "note" as KBEntry["type"] });

  const filtered = search.trim()
    ? entries.filter(e => e.title.toLowerCase().includes(search.toLowerCase()) || e.content.toLowerCase().includes(search.toLowerCase()) || e.tags.some(t => t.includes(search.toLowerCase())))
    : entries;

  const addEntry = () => {
    if (!form.title.trim() || !form.content.trim()) { toast.error("Title and content required"); return; }
    const entry: KBEntry = {
      id: Date.now().toString(),
      title: form.title,
      content: form.content,
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      updatedAt: "Just now",
      type: form.type,
    };
    setEntries(prev => [entry, ...prev]);
    setForm({ title: "", content: "", tags: "", type: "note" });
    setNewEntry(false);
    toast.success("Knowledge saved!");
  };

  const deleteEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    toast("Entry removed");
  };

  const typeIcon = (type: KBEntry["type"]) => {
    if (type === "snippet") return <FileText className="h-3.5 w-3.5 text-emerald-400" />;
    if (type === "link") return <Link2 className="h-3.5 w-3.5 text-blue-400" />;
    return <BookOpen className="h-3.5 w-3.5 text-violet-400" />;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 grid place-items-center">
            <BookOpen className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="font-display text-base">Knowledge Base</h2>
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{entries.length} entries</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setNewEntry(true)} className="h-7 w-7 rounded-lg bg-primary/10 grid place-items-center hover:bg-primary/20 transition-colors">
            <Plus className="h-3.5 w-3.5 text-primary" />
          </button>
          <button type="button" onClick={onClose} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Close</button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card/50 px-3 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search knowledge..." className="flex-1 bg-transparent text-xs outline-none" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* New entry form */}
        {newEntry && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex gap-2">
              {(["note", "snippet", "link"] as const).map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`px-3 py-1 rounded-full text-[10px] font-medium capitalize ${form.type === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {t}
                </button>
              ))}
            </div>
            <input type="text" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Title" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none" />
            <textarea value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} placeholder={form.type === "link" ? "https://..." : form.type === "snippet" ? "Paste code..." : "Note content..."} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono min-h-[60px] resize-none outline-none" />
            <input type="text" value={form.tags} onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="Tags (comma separated)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none" />
            <div className="flex gap-2">
              <button type="button" onClick={addEntry} className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-xs font-medium">
                <Save className="h-3 w-3 inline mr-1" /> Save
              </button>
              <button type="button" onClick={() => setNewEntry(false)} className="rounded-lg border border-border px-3 py-2 text-xs">Cancel</button>
            </div>
          </div>
        )}

        {/* Entries */}
        {filtered.map(entry => (
          <div key={entry.id} className="rounded-xl border border-border p-4 hover:border-primary/20 transition-colors group">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{typeIcon(entry.type)}</div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold mb-1">{entry.title}</h4>
                <p className="text-[11px] text-muted-foreground font-mono leading-relaxed line-clamp-2">{entry.content}</p>
                <div className="flex items-center gap-2 mt-2">
                  {entry.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-0.5 text-[8px] font-mono uppercase tracking-wider text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                      <Tag className="h-2 w-2" />{tag}
                    </span>
                  ))}
                  <span className="text-[8px] text-muted-foreground ml-auto flex items-center gap-0.5">
                    <Clock className="h-2 w-2" />{entry.updatedAt}
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => deleteEntry(entry.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 transition-all">
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">
            {search ? `No results for "${search}"` : "No entries yet. Click + to add one."}
          </div>
        )}
      </div>
    </div>
  );
}
