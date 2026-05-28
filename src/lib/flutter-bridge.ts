import type { MobileAppSchema } from './mobile-app-schema';
import type { MobileTheme } from './mobile-theme';

const LOCAL_FLUTTER_PREVIEW_URL = '/flutter-preview/index.html';

// The Flutter engine assets are bundled in `public/flutter-preview/` and ship
// with every deploy, so production should use the same local engine that works
// in preview/staging. An explicit VITE_FLUTTER_PREVIEW_URL still wins if set.
export function getFlutterPreviewUrl(): string {
  return import.meta.env.VITE_FLUTTER_PREVIEW_URL || LOCAL_FLUTTER_PREVIEW_URL;
}

export type FlutterMessage =
  | { type: 'SCHEMA_UPDATE'; schema: MobileAppSchema }
  | { type: 'THEME_UPDATE'; theme: MobileTheme }
  | { type: 'SCREEN_CHANGE'; screenIndex: number }
  | { type: 'DEVICE_INFO'; width: number; height: number; os: 'ios' | 'android' }
  /**
   * Studio → Flutter: please capture the rendered SchemaRenderer as a PNG
   * and post it back via `FLUTTER_SCREENSHOT`. The `requestId` round-trips
   * so multiple captures in flight don't get mixed up.
   */
  | { type: 'SCREENSHOT_REQUEST'; requestId: string };

/**
 * Send a schema update to the Flutter preview iframe.
 */
export function sendSchemaToFlutter(
  iframe: HTMLIFrameElement | null,
  schema: MobileAppSchema
): void {
  if (!iframe?.contentWindow) return;
  const message: FlutterMessage = {
    type: 'SCHEMA_UPDATE',
    schema: JSON.parse(JSON.stringify(schema)), // deep clone to avoid proxy issues
  };
  iframe.contentWindow.postMessage(message, '*');
}

/**
 * Send a theme update to the Flutter preview iframe.
 */
export function sendThemeToFlutter(
  iframe: HTMLIFrameElement | null,
  theme: MobileTheme
): void {
  if (!iframe?.contentWindow) return;
  const message: FlutterMessage = {
    type: 'THEME_UPDATE',
    theme: JSON.parse(JSON.stringify(theme)),
  };
  iframe.contentWindow.postMessage(message, '*');
}

/**
 * Send a screen change to the Flutter preview iframe.
 */
export function sendScreenChangeToFlutter(
  iframe: HTMLIFrameElement | null,
  screenIndex: number
): void {
  if (!iframe?.contentWindow) return;
  const message: FlutterMessage = {
    type: 'SCREEN_CHANGE',
    screenIndex,
  };
  iframe.contentWindow.postMessage(message, '*');
}

/**
 * Send device info (dimensions, OS) to the Flutter preview iframe.
 */
export function sendDeviceInfoToFlutter(
  iframe: HTMLIFrameElement | null,
  width: number,
  height: number,
  os: 'ios' | 'android'
): void {
  if (!iframe?.contentWindow) return;
  const message: FlutterMessage = {
    type: 'DEVICE_INFO',
    width,
    height,
    os,
  };
  iframe.contentWindow.postMessage(message, '*');
}

/**
 * Ask the Flutter preview to capture the current screen as a PNG.
 * Resolves with a `data:image/png;base64,…` URL via the FLUTTER_SCREENSHOT
 * event (correlated by `requestId`). Times out after 8 s — Flutter side
 * occasionally drops a frame during deps install / hot reload, and we'd
 * rather surface a clean error than wait forever.
 */
export function captureFlutterScreenshot(
  iframe: HTMLIFrameElement | null,
  timeoutMs = 8000,
): Promise<string> {
  if (!iframe?.contentWindow) {
    return Promise.reject(new Error('Flutter iframe is not mounted yet.'));
  }
  const requestId = `mvbl-cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise<string>((resolve, reject) => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; requestId?: string; dataUrl?: string; error?: string };
      if (!data || data.type !== 'FLUTTER_SCREENSHOT') return;
      if (data.requestId !== requestId) return;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      if (data.error) reject(new Error(data.error));
      else if (data.dataUrl) resolve(data.dataUrl);
      else reject(new Error('Flutter screenshot returned no data.'));
    };
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error(`Flutter screenshot timed out after ${timeoutMs / 1000}s.`));
    }, timeoutMs);
    window.addEventListener('message', onMessage);
    const message: FlutterMessage = { type: 'SCREENSHOT_REQUEST', requestId };
    iframe.contentWindow!.postMessage(message, '*');
  });
}

/**
 * Hook helper: listen for messages FROM the Flutter preview.
 * Flutter can send back events like 'READY', 'ERROR', 'SCREEN_TAP',
 * 'SCREENSHOT', etc.
 */
export type FlutterEvent =
  | { type: 'FLUTTER_READY' }
  | { type: 'FLUTTER_ERROR'; error: string }
  | { type: 'FLUTTER_SCREEN_TAP'; screenId: string }
  | { type: 'FLUTTER_SCREENSHOT'; requestId: string; dataUrl?: string; error?: string };

export function onFlutterMessage(
  callback: (event: FlutterEvent) => void
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.type?.startsWith('FLUTTER_')) {
      callback(event.data as FlutterEvent);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

/** Resolve when the iframe fires `FLUTTER_READY`. Times out so a
 *  half-bundled engine doesn't hang the caller forever. If the engine
 *  was already ready before this was called (e.g. we mounted it just
 *  to capture), the first SCHEMA_UPDATE round-trip will still work, so
 *  the timeout is "good enough" rather than "exactly right". */
export function waitForFlutterReady(
  iframe: HTMLIFrameElement | null,
  timeoutMs = 12_000,
): Promise<void> {
  if (!iframe) {
    return Promise.reject(new Error('Flutter iframe is not mounted.'));
  }
  return new Promise((resolve, reject) => {
    const handler = (ev: MessageEvent) => {
      const data = ev.data as { type?: string };
      if (data?.type === 'FLUTTER_READY') {
        window.removeEventListener('message', handler);
        clearTimeout(timer);
        resolve();
      }
    };
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error(`Flutter engine didn't fire READY within ${timeoutMs / 1000}s.`));
    }, timeoutMs);
    window.addEventListener('message', handler);
  });
}

/** Push DEVICE_INFO + SCREEN_CHANGE in one call so the renderer has
 *  the right MediaQuery before paint. Doesn't wait — caller pairs this
 *  with a small post-message settle delay before capture. */
export function setupFlutterFrame(
  iframe: HTMLIFrameElement | null,
  args: {
    width: number;
    height: number;
    os: 'ios' | 'android';
    screenIndex: number;
  },
): void {
  sendDeviceInfoToFlutter(iframe, args.width, args.height, args.os);
  sendScreenChangeToFlutter(iframe, args.screenIndex);
}
