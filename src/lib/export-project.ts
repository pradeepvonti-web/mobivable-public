/**
 * Converts a MobileAppSchema into a downloadable Expo/React Native project.
 * Generates all the files needed for a working Expo app.
 */
import type { MobileAppSchema, MElement, MScreen } from "./mobile-app-schema";

// ─── Icon mapping: Lucide → Expo vector icons ──────────────────
const EXPO_ICON_MAP: Record<string, string> = {
  home: "home", search: "search", user: "person", settings: "settings",
  bell: "notifications", heart: "favorite", star: "star", plus: "add",
  minus: "remove", check: "check", x: "close", "chevron-right": "chevron-right",
  "chevron-left": "chevron-left", "arrow-up": "arrow-upward",
  "arrow-down": "arrow-downward", calendar: "calendar-today", clock: "schedule",
  "map-pin": "place", camera: "camera-alt", image: "image", play: "play-arrow",
  pause: "pause", "shopping-cart": "shopping-cart", "shopping-bag": "shopping-bag",
  "credit-card": "credit-card", "dollar-sign": "attach-money",
  "trending-up": "trending-up", "trending-down": "trending-down",
  "bar-chart": "bar-chart", "pie-chart": "pie-chart", activity: "show-chart",
  trophy: "emoji-events", target: "gps-fixed", flame: "local-fire-department",
  zap: "flash-on", coffee: "coffee", edit: "edit", trash: "delete",
  lock: "lock", globe: "language", mail: "mail", phone: "phone",
  share: "share", bookmark: "bookmark", gift: "card-giftcard",
  tag: "label", package: "inventory", truck: "local-shipping",
  footprints: "directions-walk", dumbbell: "fitness-center", bike: "directions-bike",
  waves: "waves", leaf: "eco", sparkles: "auto-awesome",
};

function expoIcon(name: string): string {
  return EXPO_ICON_MAP[name] ?? "circle";
}

// ─── Theme → RN StyleSheet colors ──────────────────────────────
function themeToRNColors(theme: string | object): Record<string, string> {
  const defaults: Record<string, Record<string, string>> = {
    dark_fitness: { bg: "#0a0a1a", card: "#1a1a2e", primary: "#6366f1", accent: "#22c55e", text: "#f8fafc", muted: "#64748b", border: "#27272a", danger: "#ef4444", success: "#22c55e" },
    dark_social: { bg: "#0f0f1a", card: "#1a1a2e", primary: "#ec4899", accent: "#8b5cf6", text: "#f8fafc", muted: "#64748b", border: "#27272a", danger: "#ef4444", success: "#22c55e" },
    dark_finance: { bg: "#0a0f1a", card: "#111827", primary: "#10b981", accent: "#6366f1", text: "#f8fafc", muted: "#64748b", border: "#1f2937", danger: "#ef4444", success: "#10b981" },
    dark_ecommerce: { bg: "#0a0a0a", card: "#171717", primary: "#f59e0b", accent: "#ec4899", text: "#f8fafc", muted: "#737373", border: "#262626", danger: "#ef4444", success: "#22c55e" },
    light_clean: { bg: "#ffffff", card: "#f8fafc", primary: "#2563eb", accent: "#7c3aed", text: "#0f172a", muted: "#64748b", border: "#e2e8f0", danger: "#ef4444", success: "#22c55e" },
    light_health: { bg: "#fafdf7", card: "#ffffff", primary: "#16a34a", accent: "#0ea5e9", text: "#0f172a", muted: "#64748b", border: "#e5e7eb", danger: "#ef4444", success: "#16a34a" },
  };
  if (typeof theme === "string") return defaults[theme] ?? defaults.dark_fitness;
  return defaults.dark_fitness;
}

// ─── Element → React Native JSX string ─────────────────────────
function elementToRN(el: MElement, indent = 4): string {
  const pad = " ".repeat(indent);
  switch (el.type) {
    case "greeting":
      return `${pad}<View style={{ paddingVertical: 8 }}>\n${pad}  <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>Hello, ${el.props.name}!</Text>\n${pad}  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>${el.props.subtitle ?? "Let's get started"}</Text>\n${pad}</View>`;
    case "text":
      return `${pad}<Text style={{ fontSize: ${el.props.size === "2xl" ? 28 : el.props.size === "xl" ? 22 : el.props.size === "lg" ? 18 : el.props.size === "sm" ? 12 : el.props.size === "xs" ? 10 : 14}, fontWeight: '${el.props.weight === "bold" ? "700" : el.props.weight === "semibold" ? "600" : "400"}', color: colors.${el.props.color === "primary" ? "primary" : el.props.color === "muted" ? "muted" : el.props.color === "success" ? "success" : "text"}${el.props.align ? `, textAlign: '${el.props.align}'` : ""} }}>${el.props.content}</Text>`;
    case "button":
      return `${pad}<TouchableOpacity style={{ backgroundColor: ${el.props.variant === "outline" ? "'transparent'" : "colors.primary"}, padding: 14, borderRadius: 14, alignItems: 'center'${el.props.variant === "outline" ? ", borderWidth: 1, borderColor: colors.primary" : ""} }}>\n${pad}  <Text style={{ color: ${el.props.variant === "outline" ? "colors.primary" : "'#fff'"}, fontSize: 14, fontWeight: '600' }}>${el.props.label}</Text>\n${pad}</TouchableOpacity>`;
    case "card":
      return `${pad}<View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}>\n${el.props.title ? `${pad}  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 }}>${el.props.title}</Text>\n` : ""}${(el.props.children ?? []).map((c: MElement) => elementToRN(c, indent + 2)).join("\n")}\n${pad}</View>`;

    case "divider":
      return `${pad}<View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />`;
    case "spacer":
      return `${pad}<View style={{ height: ${el.props?.height ?? 16} }} />`;
    case "header":
      return `${pad}<View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>\n${pad}  <View style={{ flex: 1 }}>\n${pad}    <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>${el.props.title}</Text>\n${el.props.subtitle ? `${pad}    <Text style={{ fontSize: 11, color: colors.muted }}>${el.props.subtitle}</Text>\n` : ""}${pad}  </View>\n${pad}</View>`;
    case "search-bar":
      return `${pad}<View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border }}>\n${pad}  <MaterialIcons name="search" size={16} color={colors.muted} />\n${pad}  <Text style={{ marginLeft: 8, fontSize: 13, color: colors.muted }}>${el.props.placeholder ?? "Search..."}</Text>\n${pad}</View>`;
    case "list":
      return (el.props.items ?? []).map((item: { icon?: string; title: string; subtitle?: string; trailing?: string }) =>
        `${pad}<View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: colors.card, borderRadius: 10, marginBottom: 4, borderWidth: 1, borderColor: colors.border }}>\n${item.icon ? `${pad}  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>\n${pad}    <MaterialIcons name="${expoIcon(item.icon)}" size={14} color={colors.primary} />\n${pad}  </View>\n` : ""}${pad}  <View style={{ flex: 1, marginLeft: 12 }}>\n${pad}    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text }}>${item.title}</Text>\n${item.subtitle ? `${pad}    <Text style={{ fontSize: 10, color: colors.muted }}>${item.subtitle}</Text>\n` : ""}${pad}  </View>\n${item.trailing ? `${pad}  <Text style={{ fontSize: 12, color: colors.muted }}>${item.trailing}</Text>\n` : ""}${pad}</View>`
      ).join("\n");
    case "stat-row":
      return `${pad}<View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 }}>\n${(el.props.stats ?? []).map((s: { icon: string; value: string | number; label: string; color?: string }) =>
        `${pad}  <View style={{ alignItems: 'center' }}>\n${pad}    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '${s.color ?? "#6366f1"}22', alignItems: 'center', justifyContent: 'center' }}>\n${pad}      <MaterialIcons name="${expoIcon(s.icon)}" size={16} color="${s.color ?? "#6366f1"}" />\n${pad}    </View>\n${pad}    <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 6 }}>${s.value}</Text>\n${pad}    <Text style={{ fontSize: 9, color: colors.muted }}>${s.label}</Text>\n${pad}  </View>`
      ).join("\n")}\n${pad}</View>`;

    case "hero-banner":
      return `${pad}<View style={{ height: ${el.props.height ?? 160}, borderRadius: 16, padding: 20, justifyContent: 'flex-end', overflow: 'hidden' }}>\n${pad}  <LinearGradient colors={['${el.props.gradient?.includes("#") ? el.props.gradient.match(/#[0-9a-fA-F]{6}/g)?.[0] ?? "#6366f1" : "#6366f1"}', '${el.props.gradient?.includes("#") ? el.props.gradient.match(/#[0-9a-fA-F]{6}/g)?.[1] ?? "#4f46e5" : "#4f46e5"}']} style={StyleSheet.absoluteFillObject} />\n${pad}  <Text style={{ fontSize: 20, fontWeight: '700', color: '#fff' }}>${el.props.title}</Text>\n${el.props.subtitle ? `${pad}  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>${el.props.subtitle}</Text>\n` : ""}${pad}</View>`;
    case "notification":
      return `${pad}<View style={{ flexDirection: 'row', padding: 12, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.${el.props.type === "success" ? "success" : el.props.type === "error" ? "danger" : "primary"} }}>\n${pad}  <View style={{ flex: 1 }}>\n${pad}    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>${el.props.title}</Text>\n${pad}    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>${el.props.message}</Text>\n${pad}  </View>\n${pad}</View>`;
    case "rating":
      return `${pad}<View style={{ flexDirection: 'row', alignItems: 'center' }}>\n${Array.from({ length: el.props.max ?? 5 }, (_, i) => `${pad}  <Text style={{ fontSize: 18, color: ${i < Math.round(el.props.value) ? "'#f59e0b'" : "colors.border"} }}>★</Text>`).join("\n")}\n${el.props.label ? `${pad}  <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}>${el.props.label}</Text>\n` : ""}${pad}</View>`;
    case "grid-cards":
      return `${pad}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>\n${(el.props.items ?? []).map((item: { icon?: string; title: string; subtitle?: string; color?: string }) => `${pad}  <View style={{ width: '${el.props.columns === 3 ? "30" : "48"}%', backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border }}>\n${item.icon ? `${pad}    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '${item.color ?? "#6366f1"}18', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>\n${pad}      <MaterialIcons name="${expoIcon(item.icon)}" size={16} color="${item.color ?? "#6366f1"}" />\n${pad}    </View>\n` : ""}${pad}    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>${item.title}</Text>\n${item.subtitle ? `${pad}    <Text style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>${item.subtitle}</Text>\n` : ""}${pad}  </View>`).join("\n")}\n${pad}</View>`;

    default:
      return `${pad}{/* ${el.type} */}`;
  }
}

// ─── Screen → RN Component ─────────────────────────────────────
function screenToComponent(screen: MScreen, isDefault = false): string {
  const name = screen.id.charAt(0).toUpperCase() + screen.id.slice(1).replace(/[^a-zA-Z0-9]/g, "") + "Screen";
  const elements = screen.elements.map(el => elementToRN(el, 6)).join("\n\n");

  return `function ${name}() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
${elements}
    </ScrollView>
  );
}`;
}

// ─── Generate full App.tsx ──────────────────────────────────────
function generateAppTsx(schema: MobileAppSchema): string {
  const colors = themeToRNColors(schema.theme);
  const screens = schema.screens.map((s, i) => screenToComponent(s, i === 0));
  const navItems = schema.navigation?.items ?? schema.screens.slice(0, 5).map(s => ({ screen: s.id, label: s.title, icon: s.icon }));

  return `import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';

// ─── Theme colors ───────────────────────────────────────────
const colors = ${JSON.stringify(colors, null, 2)};

// ─── Screens ────────────────────────────────────────────────
${screens.join("\n\n")}

// ─── Navigation ─────────────────────────────────────────────
const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <>
      <StatusBar style="${colors.bg.startsWith("#0") || colors.bg.startsWith("#1") ? "light" : "dark"}" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: colors.bg,
              borderTopColor: colors.border,
              height: 56,
            },
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.muted,
            tabBarLabelStyle: { fontSize: 10 },
          }}
        >
${navItems.map(item => {
    const screenName = item.screen.charAt(0).toUpperCase() + item.screen.slice(1).replace(/[^a-zA-Z0-9]/g, "") + "Screen";
    return `          <Tab.Screen
            name="${item.label}"
            component={${screenName}}
            options={{
              tabBarIcon: ({ color, size }) => (
                <MaterialIcons name="${expoIcon(item.icon)}" size={size} color={color} />
              ),
            }}
          />`;
  }).join("\n")}
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}
`;
}

// ─── Generate package.json ──────────────────────────────────────
function generatePackageJson(schema: MobileAppSchema, hasSupabase: boolean, monetizationProvider?: string): string {
  const name = schema.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  const deps: Record<string, string> = {
    "expo": "~51.0.0",
    "expo-status-bar": "~1.12.1",
    "expo-linear-gradient": "~13.0.2",
    "react": "18.2.0",
    "react-native": "0.74.5",
    "@react-navigation/native": "^6.1.18",
    "@react-navigation/bottom-tabs": "^6.6.1",
    "@react-navigation/native-stack": "^6.11.0",
    "react-native-screens": "~3.31.1",
    "react-native-safe-area-context": "4.10.5",
    "@expo/vector-icons": "^14.0.2",
  };
  if (hasSupabase) {
    deps["@supabase/supabase-js"] = "^2.45.0";
    deps["@react-native-async-storage/async-storage"] = "1.23.1";
    deps["react-native-url-polyfill"] = "^2.0.0";
  }
  const monetDep = monetizationProvider
    ? MONETIZATION_NPM_DEP[monetizationProvider]
    : undefined;
  if (monetDep) deps[monetDep.pkg] = monetDep.version;
  return JSON.stringify({
    name,
    version: "1.0.0",
    main: "node_modules/expo/AppEntry.js",
    scripts: {
      start: "expo start",
      android: "expo start --android",
      ios: "expo start --ios",
      web: "expo start --web",
    },
    dependencies: deps,
    devDependencies: {
      "@babel/core": "^7.20.0",
      "@types/react": "~18.2.45",
      "typescript": "~5.3.3",
    },
    private: true,
  }, null, 2);
}

/**
 * Single source of truth for which npm package each monetization provider
 * needs. Used by both `generatePackageJson` (full project export) and
 * `exportExpoProject` (barebones starter export) so the two paths can't
 * drift apart.
 */
export const MONETIZATION_NPM_DEP: Record<string, { pkg: string; version: string }> = {
  adapty: { pkg: "react-native-adapty", version: "^2.11.0" },
  revenuecat: { pkg: "react-native-purchases", version: "^7.29.0" },
  stripe: { pkg: "@stripe/stripe-react-native", version: "^0.38.0" },
  admob: { pkg: "react-native-google-mobile-ads", version: "^14.2.0" },
};

/** Provider keys this monetization layer needs to read from `project_env_vars`. */
export const MONETIZATION_ENV_KEYS = [
  "monetization_provider",
  "monetization_model",
  "adapty_api_key",
  "adapty_placement_id",
  "revenuecat_api_key",
  "revenuecat_entitlement_id",
  "stripe_publishable_key",
  "stripe_price_id",
  // AdMob — IDs are NOT secret (they're embedded in the published binary
  // by every AdMob app), so they're safe in this allow-list.
  "admob_app_id_ios",
  "admob_app_id_android",
  "admob_banner_unit_id",
  "admob_interstitial_unit_id",
  "admob_rewarded_unit_id",
] as const;

// ─── Generate monetization lib ──────────────────────────────────
export function generateMonetizationLib(provider: string, keys: Record<string, string>): string {
  switch (provider) {
    case "adapty":
      return `import { adapty } from 'react-native-adapty';

// Initialize Adapty — call this in App.tsx useEffect
export async function initMonetization() {
  await adapty.activate('${keys.adapty_api_key || "YOUR_API_KEY"}');
}

// Show paywall
export async function showPaywall() {
  const paywall = await adapty.getPaywall('${keys.adapty_placement_id || "placement_id"}');
  return paywall;
}

// Check if user has premium access
export async function checkPremium(): Promise<boolean> {
  const profile = await adapty.getProfile();
  return profile.accessLevels['premium']?.isActive ?? false;
}

// Purchase a product
export async function purchase(productId: string) {
  const paywall = await adapty.getPaywall('${keys.adapty_placement_id || "placement_id"}');
  const products = await adapty.getPaywallProducts(paywall);
  const product = products.find(p => p.vendorProductId === productId);
  if (!product) throw new Error('Product not found');
  return adapty.makePurchase(product);
}

// Restore purchases
export async function restorePurchases() {
  return adapty.restorePurchases();
}
`;
    case "revenuecat":
      return `import Purchases from 'react-native-purchases';

// Initialize RevenueCat — call this in App.tsx useEffect
export async function initMonetization() {
  Purchases.configure({ apiKey: '${keys.revenuecat_api_key || "YOUR_API_KEY"}' });
}

// Get available offerings
export async function getOfferings() {
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

// Check if user has premium entitlement
export async function checkPremium(): Promise<boolean> {
  const info = await Purchases.getCustomerInfo();
  return info.entitlements.active['${keys.revenuecat_entitlement_id || "premium"}'] !== undefined;
}

// Purchase a package
export async function purchase(pkg: any) {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo.entitlements.active['${keys.revenuecat_entitlement_id || "premium"}'] !== undefined;
}

// Restore purchases
export async function restorePurchases() {
  const info = await Purchases.restorePurchases();
  return info.entitlements.active['${keys.revenuecat_entitlement_id || "premium"}'] !== undefined;
}
`;
    case "stripe":
      return `import { initStripe, presentPaymentSheet } from '@stripe/stripe-react-native';

// Initialize Stripe — call this in App.tsx useEffect
export async function initMonetization() {
  await initStripe({
    publishableKey: '${keys.stripe_publishable_key || "pk_live_..."}',
  });
}

// Create a checkout session (requires your own backend)
export async function createCheckout(priceId: string = '${keys.stripe_price_id || "price_..."}') {
  // TODO: Replace with your actual backend URL
  const res = await fetch('YOUR_BACKEND_URL/api/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId }),
  });
  return res.json();
}

// Present the payment sheet
export async function showPaywall(clientSecret: string) {
  const { error } = await presentPaymentSheet({ clientSecret });
  if (error) throw new Error(error.message);
  return true;
}
`;
    case "admob":
      // AdMob — Google Mobile Ads SDK via react-native-google-mobile-ads.
      //
      // The IDs ARE embedded in published binaries — they're not secret.
      // We swap in Google's TestIds while __DEV__ so devs don't risk an
      // ad-policy violation by serving real ads to themselves during
      // development (Google bans accounts that do this).
      //
      // Banner ads are rendered with <BannerAd unitId={BANNER_UNIT_ID} ... />.
      // Interstitial + Rewarded are shown imperatively via the exported
      // helpers. checkPremium() returns false — AdMob isn't a subscription
      // model, so any paywall-gated code should fall through.
      return `import mobileAds, {
  BannerAd,
  BannerAdSize,
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

const PROD_BANNER = '${keys.admob_banner_unit_id || "ca-app-pub-XXXX/XXXX"}';
const PROD_INTERSTITIAL = '${keys.admob_interstitial_unit_id || "ca-app-pub-XXXX/XXXX"}';
const PROD_REWARDED = '${keys.admob_rewarded_unit_id || "ca-app-pub-XXXX/XXXX"}';

export const BANNER_UNIT_ID = __DEV__ ? TestIds.BANNER : PROD_BANNER;
export const INTERSTITIAL_UNIT_ID = __DEV__ ? TestIds.INTERSTITIAL : PROD_INTERSTITIAL;
export const REWARDED_UNIT_ID = __DEV__ ? TestIds.REWARDED : PROD_REWARDED;

export { BannerAd, BannerAdSize };

// Call once in App.tsx useEffect — initializes the Google Mobile Ads SDK.
export async function initMonetization() {
  await mobileAds().initialize();
}

// Imperatively show an interstitial. Resolves true once shown + dismissed,
// false on load error. Each call uses a fresh ad instance.
export function showInterstitial(): Promise<boolean> {
  return new Promise((resolve) => {
    const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_UNIT_ID);
    let settled = false;
    const cleanup = () => {
      unsubLoaded();
      unsubClosed();
      unsubError();
    };
    const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      ad.show();
    });
    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      if (!settled) { settled = true; cleanup(); resolve(true); }
    });
    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      if (!settled) { settled = true; cleanup(); resolve(false); }
    });
    ad.load();
  });
}

// Imperatively show a rewarded ad. Resolves \`{ earned: true, amount }\` if
// the user watched long enough to earn the reward, \`{ earned: false }\`
// otherwise (cancelled, error, etc.).
export function showRewarded(): Promise<{ earned: boolean; amount?: number; type?: string }> {
  return new Promise((resolve) => {
    const ad = RewardedAd.createForAdRequest(REWARDED_UNIT_ID);
    let settled = false;
    let reward: { amount?: number; type?: string } | null = null;
    const cleanup = () => {
      unsubLoaded();
      unsubEarned();
      unsubClosed();
      unsubError();
    };
    const unsubLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      ad.show();
    });
    const unsubEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (r: { amount?: number; type?: string }) => {
      reward = r;
    });
    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      if (!settled) { settled = true; cleanup(); resolve(reward ? { earned: true, ...reward } : { earned: false }); }
    });
    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      if (!settled) { settled = true; cleanup(); resolve({ earned: false }); }
    });
    ad.load();
  });
}

// AdMob is not a subscription model — premium status doesn't apply here.
// Returns false so paywall-gated UI leaves content unlocked for everyone.
export async function checkPremium(): Promise<boolean> {
  return false;
}
`;
    default:
      return `// No monetization provider configured\nexport async function initMonetization() {}\nexport async function checkPremium() { return false; }\n`;
  }
}

// ─── Generate app.json ──────────────────────────────────────────
/**
 * Build the AdMob expo-plugin entry. `react-native-google-mobile-ads` ships
 * a config plugin that wires the iOS Info.plist and the Android manifest
 * with the AdMob *app* IDs (different from the *unit* IDs in lib/monetization.ts)
 * at prebuild time. Without these, the SDK boot crashes on a real device.
 */
function admobExpoPlugin(
  keys: Record<string, string>,
): unknown[] | null {
  const ios = keys.admob_app_id_ios;
  const android = keys.admob_app_id_android;
  if (!ios && !android) return null;
  return [
    "react-native-google-mobile-ads",
    {
      ...(ios ? { ios_app_id: ios } : {}),
      ...(android ? { android_app_id: android } : {}),
      user_tracking_usage_description:
        "This app uses tracking to provide personalized ads.",
    },
  ];
}

function generateAppJson(
  schema: MobileAppSchema,
  monetizationProvider?: string,
  monetizationKeys?: Record<string, string>,
): string {
  const slug = schema.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  const plugins: unknown[] = [];
  if (monetizationProvider === "admob" && monetizationKeys) {
    const admobPlugin = admobExpoPlugin(monetizationKeys);
    if (admobPlugin) plugins.push(admobPlugin);
  }
  return JSON.stringify({
    expo: {
      name: schema.name,
      slug,
      version: "1.0.0",
      orientation: "portrait",
      userInterfaceStyle: "automatic",
      splash: {
        backgroundColor: typeof schema.theme === "string" && schema.theme.startsWith("dark") ? "#0a0a1a" : "#ffffff",
      },
      ios: { supportsTablet: true },
      android: { adaptiveIcon: { backgroundColor: "#ffffff" } },
      web: { bundler: "metro" },
      ...(plugins.length > 0 ? { plugins } : {}),
    },
  }, null, 2);
}

/** Exported for the barebones export path (`exportExpoProject`) to share the helper. */
export { admobExpoPlugin };

// ─── Generate tsconfig.json ─────────────────────────────────────
function generateTsConfig(): string {
  return JSON.stringify({
    extends: "expo/tsconfig.base",
    compilerOptions: {
      strict: true,
    },
  }, null, 2);
}

// ─── Supabase client init ───────────────────────────────────────
function generateSupabaseClient(): string {
  return `import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
`;
}

// ─── Auth hook ──────────────────────────────────────────────────
function generateUseAuth(): string {
  return `import { useState, useEffect, createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session),
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
`;
}

// ─── Login screen ───────────────────────────────────────────────
function generateLoginScreen(colors: Record<string, string>): string {
  return `import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';

const colors = ${JSON.stringify(colors, null, 2)};

export default function LoginScreen({ navigation }: any) {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      return;
    }
    setLoading(true);
    setError(null);
    const result = isSignUp
      ? await signUp(email.trim(), password)
      : await signIn(email.trim(), password);
    setLoading(false);
    if (result.error) setError(result.error);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.bg }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          {isSignUp ? 'Create Account' : 'Welcome Back'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {isSignUp ? 'Sign up to get started' : 'Sign in to continue'}
        </Text>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '30' }]}>
            <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
          </View>
        )}

        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]}
          placeholder="Password"
          placeholderTextColor={colors.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {isSignUp ? 'Sign Up' : 'Sign In'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => { setIsSignUp(!isSignUp); setError(null); }}
        >
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <Text style={{ color: colors.primary, fontWeight: '600' }}>
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 24 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 24 },
  errorBox: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  input: {
    height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16,
    fontSize: 15, marginBottom: 12,
  },
  button: {
    height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  switchButton: { alignItems: 'center', marginTop: 20 },
});
`;
}

// ─── Data hooks ─────────────────────────────────────────────────
function generateDataHooks(schema: MobileAppSchema): string {
  const tableName = schema.name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
  return `import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Generic hook to fetch data from any Supabase table.
 * Usage: const { data, loading, error, refetch } = useTable('products');
 */
export function useTable<T = any>(table: string, options?: {
  select?: string;
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
  filter?: { column: string; value: any };
}) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase.from(table).select(options?.select ?? '*');
      if (options?.filter) {
        query = query.eq(options.filter.column, options.filter.value);
      }
      if (options?.orderBy) {
        query = query.order(options.orderBy, { ascending: options?.ascending ?? false });
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      const { data: rows, error: err } = await query;
      if (err) throw err;
      setData((rows ?? []) as T[]);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [table]);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook to insert a row into any Supabase table.
 * Usage: const { insert, loading } = useInsert('messages');
 */
export function useInsert<T = any>(table: string) {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const insert = async (row: Partial<T>) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(table)
        .insert({ ...row, user_id: user?.id })
        .select()
        .single();
      if (error) throw error;
      return { data, error: null };
    } catch (e: any) {
      return { data: null, error: e.message };
    } finally {
      setLoading(false);
    }
  };

  return { insert, loading };
}

/**
 * Hook to subscribe to realtime changes on a table.
 * Usage: useRealtime('messages', (payload) => console.log(payload));
 */
export function useRealtime(table: string, onInsert: (payload: any) => void) {
  useEffect(() => {
    const channel = supabase
      .channel(\`realtime:\${table}\`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (payload) => {
        onInsert(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [table]);
}
`;
}

// ─── .env.example ───────────────────────────────────────────────
function generateEnvExample(supabaseUrl?: string, anonKey?: string): string {
  return `# Supabase Configuration
# Get these from: https://supabase.com/dashboard → Settings → API
EXPO_PUBLIC_SUPABASE_URL=${supabaseUrl || "https://your-project.supabase.co"}
EXPO_PUBLIC_SUPABASE_ANON_KEY=${anonKey || "your-anon-key-here"}
`;
}

// ─── App.tsx with auth wrapper ──────────────────────────────────
function generateAppTsxWithAuth(schema: MobileAppSchema): string {
  const baseApp = generateAppTsx(schema);
  // Wrap the default export with AuthProvider
  return baseApp
    .replace(
      "import React from 'react';",
      "import React from 'react';\nimport { AuthProvider, useAuth } from './hooks/useAuth';\nimport LoginScreen from './screens/LoginScreen';",
    )
    .replace(
      "export default function App() {",
      `function MainApp() {`,
    )
    .replace(
      /}\s*$/,
      `}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <LoginScreen navigation={null} />;
  return <MainApp />;
}
`,
    );
}

// ─── Public API ─────────────────────────────────────────────────
export type ExportedFile = { path: string; content: string };

export interface ExportOptions {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  monetizationProvider?: string;
  monetizationKeys?: Record<string, string>;
}

/** Convert a MobileAppSchema into a complete set of Expo project files. */
export function exportToExpo(schema: MobileAppSchema, options?: ExportOptions): ExportedFile[] {
  const hasSupabase = !!(options?.supabaseUrl && options?.supabaseAnonKey);
  const hasMonetization = !!(options?.monetizationProvider && options?.monetizationKeys);
  const colors = themeToRNColors(schema.theme);

  const files: ExportedFile[] = [
    { path: hasSupabase ? "App.tsx" : "App.tsx", content: hasSupabase ? generateAppTsxWithAuth(schema) : generateAppTsx(schema) },
    { path: "package.json", content: generatePackageJson(schema, hasSupabase, options?.monetizationProvider) },
    { path: "app.json", content: generateAppJson(schema, options?.monetizationProvider, options?.monetizationKeys) },
    { path: "tsconfig.json", content: generateTsConfig() },
    { path: "babel.config.js", content: `module.exports = function(api) {\n  api.cache(true);\n  return { presets: ['babel-preset-expo'] };\n};\n` },
  ];

  if (hasSupabase) {
    files.push(
      { path: "lib/supabase.ts", content: generateSupabaseClient() },
      { path: "hooks/useAuth.ts", content: generateUseAuth() },
      { path: "hooks/useData.ts", content: generateDataHooks(schema) },
      { path: "screens/LoginScreen.tsx", content: generateLoginScreen(colors) },
      { path: ".env.example", content: generateEnvExample(options?.supabaseUrl, options?.supabaseAnonKey) },
      { path: ".env", content: generateEnvExample(options?.supabaseUrl, options?.supabaseAnonKey) },
    );
  }

  if (hasMonetization) {
    files.push(
      { path: "lib/monetization.ts", content: generateMonetizationLib(options!.monetizationProvider!, options!.monetizationKeys!) },
    );
  }

  // README always last
  files.push({
    path: "README.md",
    content: `# ${schema.name}\n\nGenerated by **Mobivable AI App Studio**.\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpx expo start\n\`\`\`\n\nScan the QR code with the **Expo Go** app on your phone.\n${hasSupabase ? `\n## Supabase Backend\n\nThis app is connected to Supabase. Environment variables are in \`.env\`.\n\n### Available Hooks\n\n- \`useAuth()\` — Login, signup, logout, current user\n- \`useTable('table_name')\` — Fetch data from any table\n- \`useInsert('table_name')\` — Insert rows into any table\n- \`useRealtime('table_name', callback)\` — Subscribe to live changes\n` : ""}${hasMonetization ? `\n## Monetization (${options!.monetizationProvider})\n\nIn-app purchases and subscriptions are configured in \`lib/monetization.ts\`.\n\n### Available Functions\n\n- \`initMonetization()\` — Initialize the payment SDK\n- \`showPaywall()\` — Display the paywall to the user\n- \`checkPremium()\` — Check if user has an active subscription\n` : ""}`,
  });

  return files;
}

/** Create a downloadable ZIP blob from exported files. */
export async function createExportZip(schema: MobileAppSchema, options?: ExportOptions): Promise<Blob> {
  const files = exportToExpo(schema, options);

  // Simple ZIP using the JSZip-compatible approach
  // We'll create a basic uncompressed ZIP manually
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const contentBytes = encoder.encode(file.content);
    const crc = crc32(contentBytes);

    // Local file header
    const header = new Uint8Array(30 + nameBytes.length);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x04034b50, true); // signature
    hv.setUint16(4, 20, true); // version
    hv.setUint16(6, 0, true); // flags
    hv.setUint16(8, 0, true); // compression (none)
    hv.setUint16(10, 0, true); // mod time
    hv.setUint16(12, 0, true); // mod date
    hv.setUint32(14, crc, true); // crc32
    hv.setUint32(18, contentBytes.length, true); // compressed size
    hv.setUint32(22, contentBytes.length, true); // uncompressed size
    hv.setUint16(26, nameBytes.length, true); // filename length
    hv.setUint16(28, 0, true); // extra field length
    header.set(nameBytes, 30);

    // Central directory entry
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, contentBytes.length, true);
    cv.setUint32(24, contentBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0x20, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);

    parts.push(header, contentBytes);
    centralDir.push(cd);
    offset += header.length + contentBytes.length;
  }

  // End of central directory
  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) {
    parts.push(cd);
    cdSize += cd.length;
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, centralDir.length, true);
  ev.setUint16(10, centralDir.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);
  parts.push(end);

  return new Blob(parts as BlobPart[], { type: "application/zip" });
}

/** CRC32 helper */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
