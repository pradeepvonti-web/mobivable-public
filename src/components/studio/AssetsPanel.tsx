import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Image as ImageIcon, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateAsset } from "@/lib/generate-asset.functions";

type AssetKind = "icon" | "splash";

function AssetCard({
  kind,
  title,
  description,
  projectId,
  url,
  onUploaded,
}: {
  kind: AssetKind;
  title: string;
  description: string;
  projectId: string;
  url: string | null;
  onUploaded: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const runGenerate = useServerFn(generateAsset);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  async function uploadBlob(blob: Blob, ext: "png" | "jpg") {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) throw new Error("Not signed in");
    const path = `${uid}/${projectId}/${kind}.${ext}`;
    await supabase.storage
      .from("project-attachments")
      .remove([`${uid}/${projectId}/${kind}.png`, `${uid}/${projectId}/${kind}.jpg`]);
    const contentType = ext === "png" ? "image/png" : "image/jpeg";
    const { error: upErr } = await supabase.storage
      .from("project-attachments")
      .upload(path, blob, { upsert: true, contentType });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = supabase.storage.from("project-attachments").getPublicUrl(path);
    onUploaded(`${pub.publicUrl}?t=${Date.now()}`);
  }

  async function handleGenerate() {
    setErr(null);
    const prompt = aiPrompt.trim();
    if (prompt.length < 3) {
      setErr("Describe what to generate (at least 3 characters)");
      return;
    }
    setGenerating(true);
    try {
      const res = await runGenerate({ data: { kind, prompt } });
      if (!res.ok) throw new Error(res.error);
      const dataUrl = res.dataUrl;
      const match = /^data:(image\/(png|jpe?g));base64,(.+)$/.exec(dataUrl);
      if (!match) throw new Error("Unsupported image format");
      const mime = match[1];
      const ext: "png" | "jpg" = mime === "image/png" ? "png" : "jpg";
      const bin = atob(match[3]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await uploadBlob(new Blob([bytes], { type: mime }), ext);
      setAiOpen(false);
      setAiPrompt("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }


  async function handleFile(file: File) {
    setErr(null);
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      setErr("Use a PNG or JPG file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr("Max 5MB");
      return;
    }
    setBusy(true);
    try {
      const ext: "png" | "jpg" = file.type === "image/png" ? "png" : "jpg";
      await uploadBlob(file, ext);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset() {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      await supabase.storage
        .from("project-attachments")
        .remove([`${uid}/${projectId}/${kind}.png`, `${uid}/${projectId}/${kind}.jpg`]);
      onUploaded(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center shrink-0">
          <ImageIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-base">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      {url ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-muted/20 p-4 grid place-items-center">
            <img src={url} alt={title} className="max-h-48 w-auto rounded-md object-contain" />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex-1 px-3 py-2 rounded-md border border-border text-xs hover:bg-muted/50 disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Replace
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={removeAsset}
              className="px-3 py-2 rounded-md border border-border text-xs text-muted-foreground hover:text-destructive disabled:opacity-40 flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full border border-dashed border-primary/40 rounded-lg p-8 text-center hover:bg-primary/5 transition-colors disabled:opacity-40"
        >
          <Upload className="h-6 w-6 mx-auto text-primary mb-2" />
          <p className="text-sm font-medium">
            {busy ? "Uploading…" : `Click to upload ${kind === "icon" ? "icon" : "splash screen"}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">PNG, JPG (max 5MB)</p>
        </button>
      )}

      <div className="border-t border-border pt-3 space-y-2">
        {!aiOpen ? (
          <button
            type="button"
            disabled={busy || generating}
            onClick={() => setAiOpen(true)}
            className="w-full px-3 py-2 rounded-md border border-primary/40 text-xs flex items-center justify-center gap-1.5 text-primary hover:bg-primary/5 disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate with AI
          </button>
        ) : (
          <div className="space-y-2">
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={
                kind === "icon"
                  ? "e.g. minimalist purple diamond crystal logo"
                  : "e.g. soft gradient sunrise with subtle mountain silhouette"
              }
              rows={2}
              maxLength={500}
              disabled={generating}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:border-primary resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAiOpen(false);
                  setAiPrompt("");
                  setErr(null);
                }}
                disabled={generating}
                className="px-3 py-2 rounded-md border border-border text-xs hover:bg-muted/50 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || aiPrompt.trim().length < 3}
                className="flex-1 px-3 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

function AssetsPanel({ projectId, onClose, onChanged }: { projectId: string; onClose: () => void; onChanged?: () => void }) {
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [splashUrl, setSplashUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data: files } = await supabase.storage
        .from("project-attachments")
        .list(`${uid}/${projectId}`, { limit: 100 });
      if (cancelled) return;
      const find = (kind: AssetKind) =>
        files?.find((f) => f.name === `${kind}.png` || f.name === `${kind}.jpg`);
      const iconFile = find("icon");
      const splashFile = find("splash");
      const bust = `?t=${Date.now()}`;
      setIconUrl(
        iconFile
          ? supabase.storage
              .from("project-attachments")
              .getPublicUrl(`${uid}/${projectId}/${iconFile.name}`).data.publicUrl + bust
          : null,
      );
      setSplashUrl(
        splashFile
          ? supabase.storage
              .from("project-attachments")
              .getPublicUrl(`${uid}/${projectId}/${splashFile.name}`).data.publicUrl + bust
          : null,
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
      <header className="p-5 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center shrink-0">
            <ImageIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-lg truncate">Assets</h2>
            <p className="text-xs text-muted-foreground truncate">
              Manage app icon and splash screen
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <AssetCard
              kind="icon"
              title="App Icon"
              description="Upload a custom icon · 1024x1024 PNG recommended"
              projectId={projectId}
              url={iconUrl}
              onUploaded={(u) => { setIconUrl(u); onChanged?.(); }}
            />
            <AssetCard
              kind="splash"
              title="Splash Screen"
              description="Upload a custom splash screen · 1024x1024 PNG recommended"
              projectId={projectId}
              url={splashUrl}
              onUploaded={(u) => { setSplashUrl(u); onChanged?.(); }}
            />
          </>
        )}
      </div>
    </section>
  );
}


export { AssetsPanel };
