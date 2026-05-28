/**
 * Native-capabilities catalog.
 *
 * Each entry is the single source of truth for what gets emitted into
 * a project's Expo export when the user (or the agent) opts the project
 * into that capability. The Expo exporter reads `projects.native_capabilities`
 * (jsonb array) and asks this catalog what deps / app.json plugin / iOS
 * Info.plist strings / Android permissions to inject.
 *
 * Why a catalog file rather than per-capability switch arms in the
 * exporter: the exporter is already ~400 lines. New capabilities should
 * land as one entry here + an MCP tool that knows the entry's id —
 * nothing else.
 *
 * Adding a new capability:
 *   1. Add an entry to NATIVE_CAPABILITIES with a stable `id`.
 *   2. List the npm deps with pinned Expo-51-compatible versions.
 *   3. Spell out the app.json plugin block (Expo applies it at prebuild
 *      to wire native projects).
 *   4. List iOS Info.plist permission strings and Android permissions.
 *   5. Add an MCP tool wrapper that calls `addNativeCapability(...)`.
 *
 * Versions pin to Expo SDK 51 (the same baseline `exportExpoProject`
 * already uses). Bump them together when we upgrade the baseline.
 */

/** A serialized capability entry persisted on a project row. */
export interface NativeCapabilityRow {
  /** Stable id from the catalog. */
  id: NativeCapabilityId;
  /** Per-capability user-supplied config (Stripe pub key etc.). */
  config: Record<string, string>;
  /** ISO timestamp when the capability was added. */
  added_at: string;
  /** Who added it — 'user' from the UI, 'agent' from MCP. */
  added_by: "user" | "agent";
}

export type NativeCapabilityId =
  | "push_notifications"
  | "stripe_payments"
  | "camera"
  | "biometrics";

/** What the catalog tells the exporter to emit per capability. */
export interface CapabilitySpec {
  id: NativeCapabilityId;
  /** Human label shown in the Settings / Project UI. */
  label: string;
  /** One-sentence description shown next to the chip. */
  summary: string;
  /** npm deps merged into package.json. Keys are package names. */
  dependencies: Record<string, string>;
  /** Entries appended to expo.plugins[] in app.json. */
  expoPlugins: unknown[];
  /** Permission strings written into ios.infoPlist (key → string). */
  iosInfoPlist: Record<string, string>;
  /** Strings appended to android.permissions[] in app.json. */
  androidPermissions: string[];
  /**
   * Per-capability config schema the MCP tool exposes as inputSchema.
   * Keep it small + flat — the agent fills these in when the user
   * approves the wiring.
   */
  configSchema: {
    type: "object";
    properties: Record<string, { type: "string"; description: string }>;
    required?: string[];
    additionalProperties: false;
  };
  /**
   * Caveats / "what you still have to do yourself" the tool surfaces
   * to the caller. e.g. "iOS in-app subscriptions for digital goods
   * must still use StoreKit per App Store policy."
   */
  notes: string[];
}

export const NATIVE_CAPABILITIES: Record<NativeCapabilityId, CapabilitySpec> = {
  push_notifications: {
    id: "push_notifications",
    label: "Push notifications",
    summary: "Expo Notifications (APNs + FCM). Adds remote-message entitlement + permission prompt.",
    dependencies: {
      "expo-notifications": "~0.28.9",
      "expo-device": "~6.0.2",
    },
    expoPlugins: [
      [
        "expo-notifications",
        {
          // Sound + icon are user-supplied later — these defaults work
          // until the user drops assets into ./assets/notification/.
          icon: "./assets/notification-icon.png",
          color: "#ffffff",
        },
      ],
    ],
    iosInfoPlist: {
      UIBackgroundModes: "remote-notification",
    },
    androidPermissions: ["RECEIVE_BOOT_COMPLETED", "VIBRATE"],
    configSchema: {
      type: "object",
      properties: {
        ios_apns_team_id: {
          type: "string",
          description: "Apple Developer Team ID (10-char alphanumeric). Required to register APNs.",
        },
        fcm_sender_id: {
          type: "string",
          description: "Firebase Cloud Messaging sender id for Android push delivery.",
        },
      },
      additionalProperties: false,
    },
    notes: [
      "You still need to upload an APNs key in the Expo dashboard for iOS push to deliver.",
      "Set a google-services.json at the project root for Android FCM delivery.",
    ],
  },

  stripe_payments: {
    id: "stripe_payments",
    label: "Stripe payments",
    summary: "Stripe Mobile SDK for cards, Apple Pay, Google Pay (non-digital-goods only).",
    dependencies: {
      "@stripe/stripe-react-native": "0.38.6",
    },
    expoPlugins: [
      [
        "@stripe/stripe-react-native",
        {
          // Merchant identifier is filled from `config.apple_merchant_id`
          // by the exporter — the catalog just declares the field exists.
          enableGooglePay: true,
        },
      ],
    ],
    iosInfoPlist: {},
    androidPermissions: [],
    configSchema: {
      type: "object",
      properties: {
        publishable_key: {
          type: "string",
          description: "Stripe publishable key (pk_live_… or pk_test_…). NOT the secret key.",
        },
        apple_merchant_id: {
          type: "string",
          description: "Apple Merchant ID (merchant.com.yourcompany.appname) for Apple Pay.",
        },
      },
      required: ["publishable_key"],
      additionalProperties: false,
    },
    notes: [
      "iOS subscriptions for digital goods MUST use StoreKit per App Store Guideline 3.1.1. Use Stripe for physical goods, services, donations, or web-paid purchases only.",
      "Stripe secret key goes on your server, never in the bundle.",
    ],
  },

  camera: {
    id: "camera",
    label: "Camera + photo library",
    summary: "expo-camera and expo-image-picker. Adds iOS usage strings + Android permissions.",
    dependencies: {
      "expo-camera": "~15.0.16",
      "expo-image-picker": "~15.0.7",
    },
    expoPlugins: [
      [
        "expo-camera",
        {
          // The exporter substitutes the actual strings from config.*
          // Keys here are the templated placeholders.
          cameraPermission: "{{camera_usage}}",
          microphonePermission: "{{microphone_usage}}",
          recordAudioAndroid: true,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "{{photos_usage}}",
        },
      ],
    ],
    iosInfoPlist: {
      NSCameraUsageDescription: "{{camera_usage}}",
      NSMicrophoneUsageDescription: "{{microphone_usage}}",
      NSPhotoLibraryUsageDescription: "{{photos_usage}}",
    },
    androidPermissions: ["CAMERA", "RECORD_AUDIO", "READ_MEDIA_IMAGES"],
    configSchema: {
      type: "object",
      properties: {
        camera_usage: {
          type: "string",
          description: "Plain-language reason for camera access shown in the iOS prompt.",
        },
        microphone_usage: {
          type: "string",
          description: "Plain-language reason for microphone access (only needed if recording video with audio).",
        },
        photos_usage: {
          type: "string",
          description: "Plain-language reason for photo-library access.",
        },
      },
      required: ["camera_usage"],
      additionalProperties: false,
    },
    notes: [
      "Apple rejects vague usage strings. Be specific — e.g. 'Take photos of receipts to attach to expense reports' beats 'Access camera'.",
    ],
  },

  biometrics: {
    id: "biometrics",
    label: "Biometrics (Face ID / fingerprint)",
    summary: "expo-local-authentication for Face ID, Touch ID, or Android fingerprint.",
    dependencies: {
      "expo-local-authentication": "~14.0.1",
    },
    expoPlugins: [
      [
        "expo-local-authentication",
        {
          faceIDPermission: "{{face_id_usage}}",
        },
      ],
    ],
    iosInfoPlist: {
      NSFaceIDUsageDescription: "{{face_id_usage}}",
    },
    androidPermissions: ["USE_BIOMETRIC", "USE_FINGERPRINT"],
    configSchema: {
      type: "object",
      properties: {
        face_id_usage: {
          type: "string",
          description: "Plain-language reason for Face ID — e.g. 'Unlock your account without typing a password.'",
        },
      },
      required: ["face_id_usage"],
      additionalProperties: false,
    },
    notes: [
      "Falls back to passcode on devices without enrolled biometrics. Handle that branch in your auth flow.",
    ],
  },
};

/** Type guard / id list for callers that need to iterate. */
export const NATIVE_CAPABILITY_IDS: NativeCapabilityId[] = Object.keys(
  NATIVE_CAPABILITIES,
) as NativeCapabilityId[];

/**
 * Substitute `{{key}}` placeholders in a string-or-object using the
 * caller's config. Keeps the catalog declarative — the exporter calls
 * this once per capability when emitting plugin args and Info.plist.
 */
export function applyConfigTemplate<T extends string | unknown[] | Record<string, unknown>>(
  value: T,
  config: Record<string, string>,
): T {
  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (whole, key) => {
      const v = config[key as string];
      return typeof v === "string" && v.length > 0 ? v : whole;
    }) as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => applyConfigTemplate(v as never, config)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = applyConfigTemplate(v as never, config);
    }
    return out as T;
  }
  return value;
}

/**
 * Merge a list of `NativeCapabilityRow`s into a single emission bundle
 * the Expo exporter can flatten into package.json / app.json.
 *
 * Handles cross-capability conflicts in the dumb-but-safe way:
 *   - Dependencies: last write wins (versions usually agree; if they
 *     don't, the operator gets the newer one).
 *   - Plugins: appended in catalog order, no dedupe — adding two camera
 *     capabilities would emit two plugin blocks which `expo prebuild`
 *     would reject. v2 deduplicates by name; for v1 we trust the
 *     `addNativeCapability` upsert path to keep one row per id.
 *   - Info.plist: merged; later entries overwrite. Templates expand
 *     before merge so each row uses its own config.
 *   - Android permissions: deduped by string equality.
 */
export interface CapabilityEmission {
  dependencies: Record<string, string>;
  expoPlugins: unknown[];
  iosInfoPlist: Record<string, string>;
  androidPermissions: string[];
}

export function emitForCapabilities(rows: NativeCapabilityRow[]): CapabilityEmission {
  const out: CapabilityEmission = {
    dependencies: {},
    expoPlugins: [],
    iosInfoPlist: {},
    androidPermissions: [],
  };
  const permSet = new Set<string>();

  for (const row of rows) {
    const spec = NATIVE_CAPABILITIES[row.id];
    if (!spec) continue;
    Object.assign(out.dependencies, spec.dependencies);
    for (const plugin of spec.expoPlugins) {
      out.expoPlugins.push(applyConfigTemplate(plugin as never, row.config));
    }
    for (const [k, v] of Object.entries(spec.iosInfoPlist)) {
      out.iosInfoPlist[k] = applyConfigTemplate(v, row.config);
    }
    for (const p of spec.androidPermissions) permSet.add(p);
  }
  out.androidPermissions = [...permSet];
  return out;
}
