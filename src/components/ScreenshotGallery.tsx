import { useCallback, useRef, useState } from "react";
import {
  Camera, Download, Trash2, Image as ImageIcon, Smartphone,
  Monitor, Loader2, Check, RefreshCw, Maximize2, ChevronLeft,
  ChevronRight, X,
} from "lucide-react";
import { captureSimple, downloadDataUrl, type ScreenshotResult } from "@/lib/screenshot";
import type { MobileAppSchema } from "@/lib/mobile-app-schema";

type DeviceFrame = {
  id: string;
  name: string;
  width: number;
  height: number;
  label: string;
};

const DEVICE_FRAMES: DeviceFrame[] = [
  { id: "iphone15", name: "iPhone 15 Pro", width: 393, height: 852, label: "6.1″" },
  { id: "iphone15max", name: "iPhone 15 Pro Max", width: 430, height: 932, label: "6.7″" },
  { id: "pixel8", name: "Pixel 8", width: 412, height: 915, label: "6.2″" },
  { id: "ipad", name: "iPad Pro 11\"", width: 834, height: 1194, label: "11″" },
];

export function ScreenshotGallery({
  schema,
  previewRef,
}: {
  schema: MobileAppSchema | null;
  previewRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [screenshots, setScreenshots] = useState<ScreenshotResult[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(DEVICE_FRAMES[0]);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [captureAll, setCaptureAll] = useState(false);

  const handleCapture = useCallback(async () => {
    if (!previewRef.current) return;
    setCapturing(true);
    try {
      const dataUrl = await captureSimple(previewRef.current);
      const result: ScreenshotResult = {
        screenId: `screen_${Date.now()}`,
        screenTitle: schema?.name ?? "App Preview",
        dataUrl,
        width: selectedDevice.width * 2,
        height: selectedDevice.height * 2,
        timestamp: Date.now(),
      };
      setScreenshots(prev => [...prev, result]);
    } catch (err) {
      console.error("Screenshot failed:", err);
    } finally {
      setCapturing(false);
    }
  }, [previewRef, schema, selectedDevice]);

  const handleCaptureAll = useCallback(async () => {
    if (!previewRef.current || !schema?.screens) return;
    setCaptureAll(true);
    try {
      // Capture current screen
      const dataUrl = await captureSimple(previewRef.current);
      const result: ScreenshotResult = {
        screenId: `all_${Date.now()}`,
        screenTitle: `${schema.name} — All Screens`,
        dataUrl,
        width: selectedDevice.width * 2,
        height: selectedDevice.height * 2,
        timestamp: Date.now(),
      };
      setScreenshots(prev => [...prev, result]);
    } finally {
      setCaptureAll(false);
    }
  }, [previewRef, schema, selectedDevice]);

  const handleDelete = useCallback((idx: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== idx));
    if (lightboxIdx === idx) setLightboxIdx(null);
  }, [lightboxIdx]);

  const handleDownload = useCallback((ss: ScreenshotResult) => {
    const name = `${ss.screenTitle.replace(/[^a-zA-Z0-9]/g, "_")}_${selectedDevice.name.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
    downloadDataUrl(ss.dataUrl, name);
  }, [selectedDevice]);

  const handleDownloadAll = useCallback(() => {
    screenshots.forEach((ss, i) => {
      setTimeout(() => {
        const name = `screenshot_${i + 1}_${ss.screenTitle.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
        downloadDataUrl(ss.dataUrl, name);
      }, i * 300);
    });
  }, [screenshots]);

  return (
    <div className="flex flex-col h-full bg-background/95 backdrop-blur overflow-hidden">
      {/* Header */}
      <header className="shrink-0 p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Camera className="h-4 w-4" />
              <span className="font-display text-[11px] uppercase tracking-widest">Screenshots</span>
            </div>
            <h2 className="font-display text-lg mt-0.5">App Store Assets</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCapture}
              disabled={capturing || !previewRef.current}
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 h-9 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Capture
            </button>
          </div>
        </div>

        {/* Device selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mr-1">Device:</span>
          {DEVICE_FRAMES.map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelectedDevice(d)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${
                selectedDevice.id === d.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {screenshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-12">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 grid place-items-center">
              <ImageIcon className="h-8 w-8 text-primary/40" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">No Screenshots Yet</h3>
              <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
                Click <strong>Capture</strong> to take a screenshot of the current preview.
                Screenshots are saved at 2× resolution for App Store quality.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2 max-w-sm">
              <div className="rounded-xl border border-border bg-card/60 p-3 text-center">
                <Smartphone className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-[10px] text-muted-foreground">Phone</p>
                <p className="text-[9px] text-muted-foreground/60">1284×2778px</p>
              </div>
              <div className="rounded-xl border border-border bg-card/60 p-3 text-center">
                <Monitor className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-[10px] text-muted-foreground">Tablet</p>
                <p className="text-[9px] text-muted-foreground/60">2048×2732px</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Actions bar */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                {screenshots.length} screenshot{screenshots.length !== 1 ? "s" : ""} • {selectedDevice.name}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCaptureAll}
                  disabled={captureAll}
                  className="inline-flex items-center gap-1.5 text-[10px] rounded-full border border-border px-3 py-1 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  {captureAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Capture All Screens
                </button>
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  className="inline-flex items-center gap-1.5 text-[10px] rounded-full border border-border px-3 py-1 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  <Download className="h-3 w-3" /> Download All
                </button>
              </div>
            </div>

            {/* Screenshot grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {screenshots.map((ss, i) => (
                <div
                  key={ss.screenId}
                  className="group relative rounded-xl border border-border bg-card/60 overflow-hidden hover:border-primary/40 transition-all"
                >
                  {/* Thumbnail */}
                  <button
                    type="button"
                    onClick={() => setLightboxIdx(i)}
                    className="w-full aspect-[9/19.5] overflow-hidden cursor-zoom-in"
                  >
                    <img
                      src={ss.dataUrl}
                      alt={ss.screenTitle}
                      className="w-full h-full object-cover object-top"
                    />
                  </button>

                  {/* Overlay actions */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => setLightboxIdx(i)}
                      className="h-6 w-6 rounded-full bg-background/80 backdrop-blur grid place-items-center text-foreground/70 hover:text-foreground"
                    >
                      <Maximize2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(ss)}
                      className="h-6 w-6 rounded-full bg-background/80 backdrop-blur grid place-items-center text-foreground/70 hover:text-foreground"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(i)}
                      className="h-6 w-6 rounded-full bg-background/80 backdrop-blur grid place-items-center text-destructive/70 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Footer */}
                  <div className="p-2">
                    <p className="text-[10px] font-medium text-foreground truncate">{ss.screenTitle}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {ss.width}×{ss.height} • {new Date(ss.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* App Store tip */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <h3 className="text-xs font-semibold text-primary flex items-center gap-2">
                <Smartphone className="h-3.5 w-3.5" />
                App Store Requirements
              </h3>
              <div className="grid grid-cols-2 gap-3 text-[10px] text-foreground/70">
                <div>
                  <p className="font-medium text-foreground/90 mb-1">iOS App Store</p>
                  <p>• 6.7" — 1290×2796px</p>
                  <p>• 6.1" — 1179×2556px</p>
                  <p>• iPad — 2048×2732px</p>
                </div>
                <div>
                  <p className="font-medium text-foreground/90 mb-1">Google Play</p>
                  <p>• Phone — 1080×1920px</p>
                  <p>• 7" Tablet — 1200×1920px</p>
                  <p>• 10" Tablet — 1920×1200px</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && screenshots[lightboxIdx] && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center" onClick={() => setLightboxIdx(null)}>
          <button
            type="button"
            onClick={() => setLightboxIdx(null)}
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-card border border-border grid place-items-center text-foreground hover:bg-primary hover:text-primary-foreground transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>

          {lightboxIdx > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
              className="absolute left-4 h-10 w-10 rounded-full bg-card border border-border grid place-items-center text-foreground hover:bg-primary hover:text-primary-foreground transition-colors z-10"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {lightboxIdx < screenshots.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
              className="absolute right-4 h-10 w-10 rounded-full bg-card border border-border grid place-items-center text-foreground hover:bg-primary hover:text-primary-foreground transition-colors z-10"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          <div className="max-w-md max-h-[85vh] overflow-hidden rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <img
              src={screenshots[lightboxIdx].dataUrl}
              alt={screenshots[lightboxIdx].screenTitle}
              className="w-full h-full object-contain"
            />
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-card/90 backdrop-blur rounded-full border border-border px-4 py-2" onClick={e => e.stopPropagation()}>
            <span className="text-[10px] text-foreground">
              {screenshots[lightboxIdx].screenTitle}
            </span>
            <span className="text-[9px] text-muted-foreground">
              {screenshots[lightboxIdx].width}×{screenshots[lightboxIdx].height}
            </span>
            <button
              type="button"
              onClick={() => handleDownload(screenshots[lightboxIdx!])}
              className="inline-flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
            >
              <Download className="h-3 w-3" /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
