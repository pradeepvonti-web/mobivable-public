import { useState, useMemo, useCallback, useRef } from "react";
import {
  Download, Smartphone, ExternalLink, Copy, Check,
  FileText, Package, Code2, FolderOpen, QrCode, Loader2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { MobileAppSchema } from "@/lib/mobile-app-schema";
import { exportToExpo, createExportZip, type ExportedFile, type ExportOptions } from "@/lib/export-project";
import { startExpoGo, getExpoGoTunnel } from "@/lib/expo-preview.functions";

type Tab = "files" | "qr" | "preview";

/** Export panel for downloading the app as an Expo project */
export function ExportPanel({
  schema,
  projectId,
  projectName,
  supabaseUrl,
  supabaseAnonKey,
  monetizationProvider,
  monetizationKeys,
}: {
  schema: MobileAppSchema | null;
  /** Enables the live Expo Go tunnel QR (scan to open on a phone). */
  projectId?: string;
  projectName?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /** Set by the parent route from project_env_vars.monetization_provider. */
  monetizationProvider?: string;
  /** Provider-specific keys (adapty_api_key, revenuecat_api_key, etc.) from project_env_vars. */
  monetizationKeys?: Record<string, string>;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("files");
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<string>("App.tsx");

  // Live Expo Go tunnel QR.
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const qrPollRef = useRef(false);

  const startDeviceServer = useCallback(async () => {
    if (!projectId) return;
    setQrLoading(true);
    setQrError(null);
    setQrUrl(null);
    qrPollRef.current = true;
    try {
      const r = await startExpoGo({ data: { projectId } });
      if (!r.ok) { setQrError(r.error ?? "Couldn't start the device server."); setQrLoading(false); return; }
      let tries = 0;
      const poll = async () => {
        if (!qrPollRef.current) return;
        tries++;
        try {
          const t = await getExpoGoTunnel({ data: { projectId } });
          if (!qrPollRef.current) return;
          if (t.ready && t.url) { setQrUrl(t.url); setQrLoading(false); return; }
          if (t.error && tries > 6) { setQrError(t.error); setQrLoading(false); return; }
        } catch { /* keep polling */ }
        if (tries > 40) { setQrError("The tunnel is taking too long. Try again."); setQrLoading(false); return; }
        setTimeout(poll, 3000);
      };
      setTimeout(poll, 3000);
    } catch (e) {
      setQrError(e instanceof Error ? e.message : "Couldn't start the device server.");
      setQrLoading(false);
    }
  }, [projectId]);

  // Build ExportOptions piecewise so a project with only one of Supabase /
  // monetization configured still gets the right slice baked into its zip.
  const exportOpts: ExportOptions | undefined = useMemo(() => {
    const hasSupabase = !!(supabaseUrl && supabaseAnonKey);
    const hasMonetization = !!(monetizationProvider && monetizationKeys);
    if (!hasSupabase && !hasMonetization) return undefined;
    const opts: ExportOptions = {};
    if (hasSupabase) {
      opts.supabaseUrl = supabaseUrl;
      opts.supabaseAnonKey = supabaseAnonKey;
    }
    if (hasMonetization) {
      opts.monetizationProvider = monetizationProvider;
      opts.monetizationKeys = monetizationKeys;
    }
    return opts;
  }, [supabaseUrl, supabaseAnonKey, monetizationProvider, monetizationKeys]);

  const files = useMemo(() => {
    if (!schema) return [];
    return exportToExpo(schema, exportOpts);
  }, [schema, exportOpts]);

  const handleDownload = useCallback(async () => {
    if (!schema) return;
    setDownloading(true);
    try {
      const blob = await createExportZip(schema, exportOpts);
      const name = (projectName ?? schema.name ?? "app").toLowerCase().replace(/[^a-z0-9]/g, "-");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}-expo.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }, [schema, projectName, exportOpts]);

  const handleCopy = useCallback((content: string, id: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  if (!schema) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-8">
        <Package className="h-10 w-10 opacity-30" />
        <p className="text-sm text-center">Generate an app first to export it as an Expo project.</p>
      </div>
    );
  }

  const activeFile = files.find(f => f.path === previewFile);
  const fileIcon = (path: string) => {
    if (path.endsWith(".tsx") || path.endsWith(".ts")) return <Code2 className="h-3.5 w-3.5 text-blue-400" />;
    if (path.endsWith(".json")) return <FileText className="h-3.5 w-3.5 text-yellow-400" />;
    if (path.endsWith(".js")) return <FileText className="h-3.5 w-3.5 text-amber-400" />;
    if (path.endsWith(".md")) return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
    return <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <div className="flex flex-col h-full bg-background/95 backdrop-blur overflow-hidden">
      {/* Header */}
      <header className="shrink-0 p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Package className="h-4 w-4" />
              <span className="font-display text-[11px] uppercase tracking-widest">Export</span>
            </div>
            <h2 className="font-display text-lg mt-0.5">{schema.name}</h2>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 h-9 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "Building..." : "Download ZIP"}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-0.5 w-fit">
          {([
            { id: "files", label: "Files", icon: FolderOpen },
            { id: "qr", label: "QR Code", icon: QrCode },
            { id: "preview", label: "Preview", icon: Code2 },
          ] as const).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                activeTab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-3 w-3" />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "files" && (
          <div className="space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
              {files.length} files • Expo SDK 51
            </p>
            {files.map(f => (
              <button
                key={f.path}
                type="button"
                onClick={() => { setPreviewFile(f.path); setActiveTab("preview"); }}
                className="w-full flex items-center gap-3 rounded-xl border border-border bg-card/60 p-3 hover:border-primary/40 transition-colors text-left"
              >
                {fileIcon(f.path)}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground">{f.path}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {(new TextEncoder().encode(f.content).length / 1024).toFixed(1)} KB
                  </div>
                </div>
                <Code2 className="h-3.5 w-3.5 text-muted-foreground/40" />
              </button>
            ))}

            {/* Quick start */}
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <h3 className="text-xs font-semibold text-primary flex items-center gap-2">
                <Smartphone className="h-3.5 w-3.5" />
                Quick Start
              </h3>
              <div className="space-y-1">
                {[
                  "Download and unzip the project",
                  "Run `npm install` in the project directory",
                  "Run `npx expo start` to launch",
                  "Scan the QR code with Expo Go app",
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-foreground/80">
                    <span className="text-primary font-mono text-[10px] mt-0.5">{i + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "qr" && (
          <div className="flex flex-col items-center justify-center gap-6 py-8">
            {/* Live Expo Go tunnel QR — scan to open the real app on a phone. */}
            {qrUrl ? (
              <div className="w-48 h-48 rounded-2xl grid place-items-center bg-white p-3">
                <QRCodeSVG value={qrUrl} size={168} />
              </div>
            ) : (
              <div className="w-48 h-48 rounded-2xl border-2 border-dashed border-border grid place-items-center bg-card/60">
                <div className="text-center space-y-2 px-3">
                  {qrLoading ? (
                    <>
                      <Loader2 className="h-10 w-10 text-primary/70 mx-auto animate-spin" />
                      <p className="text-[10px] text-muted-foreground">Building a secure tunnel…<br />~30–90s</p>
                    </>
                  ) : qrError ? (
                    <p className="text-[10px] text-destructive">{qrError}</p>
                  ) : (
                    <>
                      <QrCode className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                      <p className="text-[10px] text-muted-foreground">Start the dev server<br />to get a scannable QR</p>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="text-center space-y-2 max-w-xs">
              <h3 className="text-sm font-semibold text-foreground">Preview on Device</h3>
              {qrUrl ? (
                <>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Scan with the <strong>Expo Go</strong> app — camera, location &amp; native features run here. First open bundles on the device (~30s).
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCopy(qrUrl, "exp-url")}
                    className="w-full truncate rounded-lg border border-border bg-card/60 px-3 py-1.5 text-[10px] font-mono text-foreground/80 hover:bg-card"
                    title="Click to copy"
                  >
                    {copied === "exp-url" ? "Copied!" : qrUrl}
                  </button>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {projectId
                    ? <>Start a live dev server in the cloud and scan the QR with the <strong>Expo Go</strong> app — no local setup.</>
                    : <>Download the project, run <code className="text-[10px] bg-card px-1.5 py-0.5 rounded font-mono">npx expo start</code>, then scan with the <strong>Expo Go</strong> app.</>}
                </p>
              )}
            </div>

            {projectId && (
              <button
                type="button"
                onClick={startDeviceServer}
                disabled={qrLoading}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {qrLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
                {qrLoading ? "Starting…" : qrUrl ? "Restart dev server" : "Start dev server & show QR"}
              </button>
            )}
            <div className="flex gap-2">
              <a
                href="https://apps.apple.com/app/expo-go/id982107779"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> iOS App Store
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=host.exp.exponent"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> Google Play
              </a>
            </div>
          </div>
        )}

        {activeTab === "preview" && activeFile && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {fileIcon(activeFile.path)}
                <span className="text-xs font-medium text-foreground">{activeFile.path}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(activeFile.content, activeFile.path)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                {copied === activeFile.path ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied === activeFile.path ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
              <pre className="p-4 overflow-x-auto text-[10px] leading-relaxed font-mono text-foreground/80 max-h-[60vh]">
                <code>{activeFile.content}</code>
              </pre>
            </div>
            {/* File switcher */}
            <div className="flex flex-wrap gap-1.5">
              {files.map(f => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => setPreviewFile(f.path)}
                  className={`rounded-full px-2.5 py-1 text-[9px] font-mono transition-colors ${
                    previewFile === f.path
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {f.path}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
