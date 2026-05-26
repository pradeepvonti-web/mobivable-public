import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { History, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function HistoryDialog({
  currentProjectId,
  onClose,
}: {
  currentProjectId: string;
  onClose: () => void;
}) {
  type Row = {
    id: string;
    name: string | null;
    prompt: string;
    updated_at: string;
  };
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) {
      setErr("Not signed in");
      setRows([]);
      return;
    }
    const { data, error } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => Promise<{
              data: Row[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    })
      .from("projects")
      .select("id, name, prompt, updated_at")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false });
    if (error) {
      setErr(error.message);
      setRows([]);
      return;
    }
    setRows(data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this chat session? This can't be undone.")) return;
    setDeletingId(id);
    try {
      await supabase.from("project_messages").delete().eq("project_id", id);
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
      setRows((r) => (r ? r.filter((x) => x.id !== id) : r));
      toast("Chat deleted");
      if (id === currentProjectId && typeof window !== "undefined") {
        window.location.assign("/dashboard");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Chat history</h2>
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
        <div className="flex-1 overflow-y-auto p-2">
          {rows === null ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : err ? (
            <div className="p-6 text-sm text-destructive">{err}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No previous chats yet.
            </div>
          ) : (
            <ul className="space-y-1">
              {rows.map((r) => {
                const isCurrent = r.id === currentProjectId;
                return (
                  <li
                    key={r.id}
                    className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-accent transition-colors ${
                      isCurrent ? "bg-accent/60" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {r.name || "Untitled"}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] uppercase tracking-wider text-primary">
                            current
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {r.prompt}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1">
                        {new Date(r.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!isCurrent && (
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: r.id }}
                          onClick={onClose}
                          className="h-8 px-3 inline-flex items-center rounded-md text-xs font-medium border border-border hover:bg-background"
                        >
                          Open
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-background disabled:opacity-50"
                        aria-label="Delete chat"
                      >
                        {deletingId === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export { HistoryDialog };
