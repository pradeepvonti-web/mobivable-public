import { useEffect, useRef, useState } from "react";
import { BookOpen, Link as LinkIcon, Loader2, Paperclip, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ingestUrl } from "@/lib/ingest-url.functions";

type KnowledgeRow = {
  id: string;
  title: string;
  content: string;
  file_url: string | null;
  file_name: string | null;
  updated_at: string;
};

function KnowledgeDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<KnowledgeRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [editing, setEditing] = useState<KnowledgeRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftFileUrl, setDraftFileUrl] = useState<string | null>(null);
  const [draftFileName, setDraftFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // URL ingestion: optional second affordance next to "New knowledge item".
  // Visible only when not currently drafting an item so the form stays simple.
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const ingestUrlFn = useServerFn(ingestUrl);

  const db = supabase as unknown as {
    from: (t: string) => any;
    storage: { from: (b: string) => any };
  };

  async function load() {
    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const id = u.user?.id ?? null;
    setUid(id);
    if (!id) {
      setErr("Not signed in");
      setRows([]);
      return;
    }
    const { data, error } = await db
      .from("knowledge_items")
      .select("id, title, content, file_url, file_name, updated_at")
      .eq("user_id", id)
      .order("updated_at", { ascending: false });
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as KnowledgeRow[]);
  }

  useEffect(() => {
    void load();
  }, []);

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setDraftTitle("");
    setDraftContent("");
    setDraftFileUrl(null);
    setDraftFileName(null);
  }
  function startEdit(r: KnowledgeRow) {
    setCreating(false);
    setEditing(r);
    setDraftTitle(r.title);
    setDraftContent(r.content);
    setDraftFileUrl(r.file_url);
    setDraftFileName(r.file_name);
  }
  function cancelDraft() {
    setEditing(null);
    setCreating(false);
  }

  async function handleUpload(file: File) {
    if (!uid) return;
    setUploading(true);
    try {
      const path = `${uid}/knowledge/${Date.now()}-${file.name}`;
      const { error } = await db.storage
        .from("project-attachments")
        .upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = db.storage.from("project-attachments").getPublicUrl(path);
      setDraftFileUrl(data.publicUrl as string);
      setDraftFileName(file.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!uid) return;
    if (!draftTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    setSavingId(editing?.id ?? "new");
    try {
      if (editing) {
        const { error } = await db
          .from("knowledge_items")
          .update({
            title: draftTitle.trim(),
            content: draftContent,
            file_url: draftFileUrl,
            file_name: draftFileName,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast("Knowledge updated");
      } else {
        const { error } = await db.from("knowledge_items").insert({
          user_id: uid,
          title: draftTitle.trim(),
          content: draftContent,
          file_url: draftFileUrl,
          file_name: draftFileName,
        });
        if (error) throw error;
        toast("Knowledge added");
      }
      cancelDraft();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  }

  async function handleIngestUrl() {
    const url = urlDraft.trim();
    if (!url) return;
    setIngesting(true);
    try {
      const r = await ingestUrlFn({ data: { url } });
      if (r.ok) {
        toast.success(`Ingested ${r.charsStored.toLocaleString()} chars from ${new URL(r.sourceUrl).hostname}`);
        setUrlDraft("");
        setUrlInputOpen(false);
        await load();
      } else {
        toast.error(r.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "URL ingest failed");
    } finally {
      setIngesting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this knowledge item?")) return;
    setSavingId(id);
    try {
      const { error } = await db.from("knowledge_items").delete().eq("id", id);
      if (error) throw error;
      setRows((r) => (r ? r.filter((x) => x.id !== id) : r));
      toast("Knowledge deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setSavingId(null);
    }
  }

  const isDrafting = creating || !!editing;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Knowledge</h2>
            <span className="text-xs text-muted-foreground">
              Reference snippets and files the AI can use
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-muted/60"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {isDrafting ? (
            <div className="rounded-xl border border-border p-3 space-y-3 bg-background/40">
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Title (e.g. Brand voice, API spec)"
                className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder="Reference snippet the AI should remember…"
                rows={6}
                className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium border border-border hover:bg-background disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" />
                  )}
                  {draftFileName ? "Replace file" : "Attach file"}
                </button>
                {draftFileName && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <a
                      href={draftFileUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="underline truncate max-w-[200px]"
                    >
                      {draftFileName}
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftFileUrl(null);
                        setDraftFileName(null);
                      }}
                      className="h-6 w-6 grid place-items-center rounded hover:bg-background"
                      aria-label="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelDraft}
                    className="h-8 px-3 inline-flex items-center rounded-md text-xs font-medium hover:bg-muted/60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={savingId !== null}
                    className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {savingId !== null && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {editing ? "Save changes" : "Add knowledge"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={startCreate}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New knowledge item
                </button>
                <button
                  type="button"
                  onClick={() => setUrlInputOpen((v) => !v)}
                  aria-pressed={urlInputOpen}
                  className={`inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-dashed text-xs font-medium transition-colors ${
                    urlInputOpen
                      ? "border-primary text-primary bg-primary/5"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/40"
                  }`}
                  title="Fetch a public URL and save its visible text as a knowledge item."
                >
                  <LinkIcon className="h-3.5 w-3.5" />
                  From URL
                </button>
              </div>
              {urlInputOpen && (
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !ingesting && urlDraft.trim()) {
                        e.preventDefault();
                        void handleIngestUrl();
                      }
                    }}
                    placeholder="https://docs.your-spec.com/api"
                    autoFocus
                    disabled={ingesting}
                    className="flex-1 h-9 rounded-md border border-border bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => void handleIngestUrl()}
                    disabled={ingesting || !urlDraft.trim()}
                    className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {ingesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LinkIcon className="h-3.5 w-3.5" />}
                    {ingesting ? "Fetching…" : "Ingest"}
                  </button>
                </div>
              )}
            </div>
          )}

          {rows === null ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : err ? (
            <div className="p-6 text-sm text-destructive">{err}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No knowledge items yet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="group flex items-start gap-3 rounded-xl border border-border/60 px-3 py-2.5 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    {r.content && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-wrap">
                        {r.content}
                      </p>
                    )}
                    {r.file_name && (
                      <a
                        href={r.file_url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground/90 underline"
                      >
                        <Paperclip className="h-3 w-3" />
                        {r.file_name}
                      </a>
                    )}
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      Updated {new Date(r.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background"
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      disabled={savingId === r.id}
                      className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-background disabled:opacity-50"
                      aria-label="Delete"
                    >
                      {savingId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}


export { KnowledgeDialog };
