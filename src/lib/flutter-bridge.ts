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
  | { type: 'DEVICE_INFO'; width: number; height: number; os: 'ios' | 'android' };

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
 * Hook helper: listen for messages FROM the Flutter preview.
 * Flutter can send back events like 'READY', 'ERROR', 'SCREEN_TAP', etc.
 */
export type FlutterEvent =
  | { type: 'FLUTTER_READY' }
  | { type: 'FLUTTER_ERROR'; error: string }
  | { type: 'FLUTTER_SCREEN_TAP'; screenId: string };

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
