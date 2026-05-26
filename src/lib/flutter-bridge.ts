import type { MobileAppSchema } from './mobile-app-schema';
import type { MobileTheme } from './mobile-theme';

const LOCAL_FLUTTER_PREVIEW_URL = '/flutter-preview/index.html';
const HOSTED_FLUTTER_PREVIEW_URL = 'https://flutter-preview-engine.onrender.com/index.html';

function shouldUseLocalFlutterPreview(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return true;

  const hostname = window.location.hostname;

  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.lovableproject.com') ||
    hostname.includes('--')
  );
}

// Resolve the Flutter engine URL at runtime so preview/staging environments keep
// using the bundled local engine, while published production uses the hosted one.
export function getFlutterPreviewUrl(): string {
  return (
    import.meta.env.VITE_FLUTTER_PREVIEW_URL ||
    (shouldUseLocalFlutterPreview()
      ? LOCAL_FLUTTER_PREVIEW_URL
      : HOSTED_FLUTTER_PREVIEW_URL)
  );
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
