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

// ─── Flutter prop-contract adapter ──────────────────────────────────────
//
// The committed Flutter preview engine (public/flutter-preview/main.dart.js)
// reads a handful of element props under DIFFERENT keys than the schema
// generator emits. The generator targets the contract in CODE_GEN_SYSTEM_PROMPT
// (and the React renderer, which matches it), but `element_renderer.dart`
// drifted — e.g. it reads `props.text` for a marquee while the schema emits
// `props.items: string[]`, so it always shows the "Scrolling text..." default.
//
// Until the engine is recompiled from corrected Dart source, this adapter
// bridges the gap on the JS side: for each affected element it copies the
// spec-named prop into the key the engine reads. It is NON-DESTRUCTIVE — it
// only fills the engine key when that key is absent, so any schema already
// using the engine key (or a future rebuilt engine reading the spec key) is
// untouched. Mirrors the mismatch table audited against the schema spec.

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyObj = Record<string, any>;

/** Map a single element's props from spec keys → keys the engine reads. */
function adaptElementForFlutter(el: AnyObj): void {
  if (!el || typeof el !== 'object') return;
  const type = el.type;
  // The engine reads `element['props'] ?? element`, so props may be nested
  // under `props` or flattened onto the element. Mutate whichever holds them.
  const props: AnyObj = el.props && typeof el.props === 'object' ? el.props : el;

  switch (type) {
    case 'marquee':
      // spec: { items: string[] }  →  engine reads: text (single string)
      if (props.text == null && Array.isArray(props.items)) {
        const sep = typeof props.separator === 'string' ? `   ${props.separator}   ` : '     •     ';
        props.text = props.items.filter((s: unknown) => typeof s === 'string').join(sep);
      }
      break;
    case 'stat-card-xl':
      // spec: { label, deltaDirection }  →  engine reads: title, deltaType
      if (props.title == null && props.label != null) props.title = props.label;
      if (props.deltaType == null && props.deltaDirection != null) {
        props.deltaType = props.deltaDirection === 'down' ? 'negative' : 'positive';
      }
      break;
    case 'pricing-card':
      // spec: { name }  →  engine reads: planName
      if (props.planName == null && props.name != null) props.planName = props.name;
      break;
    case 'empty-state':
    case 'map-card':
      // spec: { actionLabel }  →  engine reads: buttonLabel
      if (props.buttonLabel == null && props.actionLabel != null) props.buttonLabel = props.actionLabel;
      break;
    case 'bank-card':
      // spec: { cardNumber, gradient }  →  engine reads: lastFour, gradientColors
      if (props.lastFour == null && props.cardNumber != null) {
        props.lastFour = String(props.cardNumber).replace(/\D/g, '').slice(-4);
      }
      if (props.gradientColors == null && props.gradient != null) props.gradientColors = props.gradient;
      break;
    case 'chat-bubble':
      // spec: { placeholder }  →  engine reads: inputPlaceholder
      if (props.inputPlaceholder == null && props.placeholder != null) props.inputPlaceholder = props.placeholder;
      break;
    case 'radar-chart':
      // spec: { color }  →  engine reads: fillColor / strokeColor
      if (props.fillColor == null && props.color != null) props.fillColor = props.color;
      if (props.strokeColor == null && props.color != null) props.strokeColor = props.color;
      break;
    case 'calendar-strip':
      // spec: { showMonth }  →  engine reads: showHeader
      if (props.showHeader == null && props.showMonth != null) props.showHeader = props.showMonth;
      break;
    case 'swipe-card':
      // spec: cards[].prompt  →  engine reads: cards[].imagePrompt
      if (Array.isArray(props.cards)) {
        for (const c of props.cards) {
          if (c && typeof c === 'object' && c.imagePrompt == null && c.prompt != null) {
            c.imagePrompt = c.prompt;
          }
        }
      }
      break;
  }

  // Recurse into nested element arrays so adapted props reach children of
  // containers (section, card, glass-card, gradient-mesh-bg, bottom-sheet…).
  // All fills above are guarded by `== null`, so visiting the same node twice
  // (when props === el) is idempotent.
  for (const arr of [props.children, props.elements, el.children, el.elements]) {
    if (Array.isArray(arr)) {
      for (const child of arr) adaptElementForFlutter(child);
    }
  }
}

/**
 * Return a deep clone of `schema` with every element's props remapped to the
 * keys the compiled Flutter engine reads. See `adaptElementForFlutter`.
 */
export function normalizeSchemaForFlutter(schema: MobileAppSchema): MobileAppSchema {
  const clone = JSON.parse(JSON.stringify(schema)) as MobileAppSchema;
  const screens = (clone as AnyObj).screens;
  if (Array.isArray(screens)) {
    for (const screen of screens) {
      if (Array.isArray(screen?.elements)) {
        for (const el of screen.elements) adaptElementForFlutter(el as AnyObj);
      }
    }
  }
  return clone;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
    // Remap spec prop keys → engine prop keys (also deep-clones, avoiding
    // proxy issues with the live schema object).
    schema: normalizeSchemaForFlutter(schema),
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
