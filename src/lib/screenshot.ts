/**
 * Captures screenshots of the mobile app preview for App Store metadata.
 * Uses html2canvas-style approach via the native Canvas API.
 */

export type ScreenshotResult = {
  screenId: string;
  screenTitle: string;
  dataUrl: string;
  width: number;
  height: number;
  timestamp: number;
};

/**
 * Capture a screenshot of a DOM element as a PNG data URL.
 * Uses the browser-native approach via SVG foreignObject → Canvas.
 */
export async function captureElement(
  element: HTMLElement,
  scale = 2,
): Promise<string> {
  const { width, height } = element.getBoundingClientRect();
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);

  // Clone the element to avoid modifying the live DOM
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.position = "absolute";
  clone.style.left = "-9999px";
  clone.style.top = "-9999px";
  document.body.appendChild(clone);

  // Compute all styles inline
  inlineStyles(element, clone);

  const serializer = new XMLSerializer();
  const html = serializer.serializeToString(clone);
  document.body.removeChild(clone);

  // Create SVG foreignObject
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <foreignObject width="100%" height="100%" style="transform: scale(${scale}); transform-origin: top left;">
      <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;">
        ${html}
      </div>
    </foreignObject>
  </svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("No canvas context")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Screenshot capture failed"));
    };
    img.src = url;
  });
}

/** Recursively copy computed styles to a cloned element */
function inlineStyles(source: Element, target: Element) {
  const computed = window.getComputedStyle(source);
  const targetEl = target as HTMLElement;
  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i];
    try {
      targetEl.style.setProperty(prop, computed.getPropertyValue(prop));
    } catch { /* skip unsettable properties */ }
  }
  const sourceChildren = source.children;
  const targetChildren = target.children;
  for (let i = 0; i < Math.min(sourceChildren.length, targetChildren.length); i++) {
    inlineStyles(sourceChildren[i], targetChildren[i]);
  }
}

/**
 * Simple fallback: capture by drawing the element using Canvas2D.
 * This works for simple UIs without complex CSS.
 */
export async function captureSimple(
  element: HTMLElement,
  backgroundColor = "#0a0a1a",
): Promise<string> {
  const { width, height } = element.getBoundingClientRect();
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");

  ctx.scale(scale, scale);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Attempt SVG foreignObject approach
  try {
    return await captureElement(element, scale);
  } catch {
    // Fallback: just return a colored rectangle with app name
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 16px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Screenshot", width / 2, height / 2 - 10);
    ctx.font = "11px -apple-system, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.fillText("Preview not available", width / 2, height / 2 + 10);
    return canvas.toDataURL("image/png");
  }
}

/** Download a data URL as a file */
export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Convert a data URL to a Blob */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
