import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Wifi, BatteryFull, Signal } from "lucide-react";

export type DeviceOS = "ios" | "android";

/**
 * Realistic iOS / Android device frame.
 * Renders chrome (status bar + notch/punch-hole + home indicator/gesture bar)
 * around its children. Color of the status bar text/icons auto-adapts to the
 * provided `screenBg` so it reads on both light and dark app themes.
 */
export function DeviceFrame({
  os = "ios",
  screenBg,
  width = 320,
  height = 640,
  children,
}: {
  os?: DeviceOS;
  /** Hex/rgb/oklch color of the app screen background (top area). Used to pick contrast for the status bar. */
  screenBg?: string;
  width?: number;
  height?: number;
  children: ReactNode;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const time = useMemo(
    () =>
      now.toLocaleTimeString([], {
        hour: os === "ios" ? "numeric" : "2-digit",
        minute: "2-digit",
      }),
    [now, os],
  );

  // Pick light vs dark chrome based on screen bg luminance.
  const isDarkScreen = useMemo(() => estimateIsDark(screenBg), [screenBg]);
  const chromeColor = isDarkScreen ? "#ffffff" : "#0a0a0a";

  const radius = os === "ios" ? 44 : 32;
  const bezel = os === "ios" ? 10 : 8;
  const statusBarH = os === "ios" ? 38 : 28;
  const homeBarH = os === "ios" ? 22 : 18;

  return (
    <div
      className="relative"
      style={{ width: width + bezel * 2, height: height + bezel * 2 }}
    >
      {/* Soft glow halo */}
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[3rem] blur-2xl opacity-50 pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--primary) 60%, transparent), transparent 70%)",
        }}
      />

      {/* Outer bezel */}
      <div
        className="relative shadow-2xl"
        style={{
          width: "100%",
          height: "100%",
          borderRadius: radius,
          padding: bezel,
          background:
            "linear-gradient(140deg, #1c1c1e 0%, #0a0a0a 50%, #1c1c1e 100%)",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.06), 0 30px 60px -20px rgba(0,0,0,0.6)",
        }}
      >
        {/* Side buttons */}
        {os === "ios" ? (
          <>
            <span style={sideBtn(120, 32, "left")} />
            <span style={sideBtn(180, 56, "left")} />
            <span style={sideBtn(260, 56, "left")} />
            <span style={sideBtn(170, 80, "right")} />
          </>
        ) : (
          <>
            <span style={sideBtn(160, 50, "right")} />
            <span style={sideBtn(230, 90, "right")} />
          </>
        )}

        {/* Screen */}
        <div
          className="relative overflow-hidden"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: radius - bezel,
            background: screenBg ?? "#0a0a1a",
          }}
        >
          {/* Status bar */}
          <div
            className="absolute top-0 inset-x-0 z-30 flex items-center justify-between"
            style={{
              height: statusBarH,
              padding:
                os === "ios" ? "10px 24px 0 24px" : "6px 16px 0 16px",
              color: chromeColor,
              fontSize: 12,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              pointerEvents: "none",
            }}
          >
            <span style={{ letterSpacing: os === "ios" ? "-0.01em" : 0 }}>
              {time}
            </span>
            <div className="flex items-center gap-1.5">
              {os === "ios" ? (
                <>
                  <Signal style={{ width: 14, height: 11 }} strokeWidth={0} fill={chromeColor} />
                  <Wifi style={{ width: 14, height: 14 }} strokeWidth={2.5} />
                  <BatteryShape color={chromeColor} />
                </>
              ) : (
                <>
                  <Wifi style={{ width: 13, height: 13 }} strokeWidth={2.5} />
                  <Signal style={{ width: 13, height: 11 }} strokeWidth={2.5} />
                  <BatteryShape color={chromeColor} />
                </>
              )}
            </div>
          </div>

          {/* Notch / Dynamic Island / Punch-hole */}
          {os === "ios" ? (
            <div
              aria-hidden
              className="absolute z-40"
              style={{
                top: 10,
                left: "50%",
                transform: "translateX(-50%)",
                width: 95,
                height: 26,
                borderRadius: 999,
                background: "#000",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
              }}
            />
          ) : (
            <div
              aria-hidden
              className="absolute z-40"
              style={{
                top: 8,
                left: "50%",
                transform: "translateX(-50%)",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#000",
              }}
            />
          )}

          {/* App content — pushed below status bar */}
          <div
            style={{
              position: "absolute",
              top: statusBarH,
              left: 0,
              right: 0,
              bottom: homeBarH,
              overflow: "hidden",
            }}
          >
            {children}
          </div>

          {/* Home indicator (iOS) / gesture bar (Android) */}
          <div
            className="absolute bottom-0 inset-x-0 z-30 flex items-center justify-center"
            style={{ height: homeBarH, pointerEvents: "none" }}
          >
            <div
              style={{
                width: os === "ios" ? 120 : 90,
                height: os === "ios" ? 5 : 3,
                borderRadius: 999,
                background: chromeColor,
                opacity: 0.85,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BatteryShape({ color }: { color: string }) {
  return (
    <div
      style={{
        position: "relative",
        width: 24,
        height: 11,
        border: `1.2px solid ${color}`,
        borderRadius: 3,
        padding: 1.2,
      }}
    >
      <div
        style={{
          width: "78%",
          height: "100%",
          background: color,
          borderRadius: 1.5,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -3,
          top: "30%",
          width: 2,
          height: "40%",
          background: color,
          borderRadius: 1,
        }}
      />
    </div>
  );
}

function sideBtn(
  top: number,
  height: number,
  side: "left" | "right",
): React.CSSProperties {
  return {
    position: "absolute",
    top,
    [side]: -2,
    width: 3,
    height,
    borderRadius: 2,
    background: "linear-gradient(90deg, #2a2a2c, #050505)",
  } as React.CSSProperties;
}

/** Best-effort luminance check across hex / rgb / oklch / hsl. Defaults dark. */
function estimateIsDark(color?: string): boolean {
  if (!color) return true;
  const c = color.trim().toLowerCase();

  // hex
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return rgbLum(r, g, b) < 0.5;
  }
  // rgb
  const rgb = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) return rgbLum(+rgb[1], +rgb[2], +rgb[3]) < 0.5;

  // oklch(L ...)  L is 0..1 (or 0..100%) — first number
  const ok = c.match(/oklch\(\s*([\d.]+)%?/);
  if (ok) {
    const L = parseFloat(ok[1]);
    const norm = L > 1 ? L / 100 : L;
    return norm < 0.6;
  }
  // hsl
  const hsl = c.match(/hsla?\([^,]+,\s*[^,]+,\s*([\d.]+)%/);
  if (hsl) return parseFloat(hsl[1]) < 50;

  return true;
}

function rgbLum(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
