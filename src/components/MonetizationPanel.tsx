import { useState, useEffect } from "react";
import {
  DollarSign, ExternalLink, Save, Loader2, Check, AlertTriangle,
  CreditCard, ShoppingBag, Repeat, ChevronRight, Info, X, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/* ─── Provider Definitions ─── */
type MonetizationProvider = "adapty" | "revenuecat" | "stripe" | "admob";

type ProviderConfig = {
  id: MonetizationProvider;
  name: string;
  tagline: string;
  logo: string;
  color: string;
  features: string[];
  docsUrl: string;
  fields: { key: string; label: string; placeholder: string; sensitive?: boolean }[];
  setupSteps: string[];
};

const PROVIDERS: ProviderConfig[] = [
  {
    id: "adapty",
    name: "Adapty",
    tagline: "In-app purchases & subscriptions",
    logo: "🔵",
    color: "#5856D6",
    features: ["Paywalls", "A/B Testing", "Analytics", "Subscriptions", "One-time purchases"],
    docsUrl: "https://adapty.io",
    fields: [
      { key: "adapty_api_key", label: "Adapty API Key", placeholder: "public_live_..." },
      { key: "adapty_placement_id", label: "Adapty Placement ID", placeholder: "your_placement_id" },
    ],
    setupSteps: [
      "Create an account at adapty.io",
      "Enter your API key and placement ID above",
      "Ask the AI to set up in-app purchases in your app",
    ],
  },
  {
    id: "revenuecat",
    name: "RevenueCat",
    tagline: "Subscription infrastructure for mobile",
    logo: "🐱",
    color: "#FF6363",
    features: ["Subscriptions", "Entitlements", "Analytics", "Webhooks", "Cross-platform"],
    docsUrl: "https://revenuecat.com",
    fields: [
      { key: "revenuecat_api_key", label: "Public API Key", placeholder: "appl_..." },
      { key: "revenuecat_entitlement_id", label: "Entitlement ID", placeholder: "premium" },
    ],
    setupSteps: [
      "Create an account at revenuecat.com",
      "Create a project and add your app",
      "Copy the public API key from the dashboard",
      "Define entitlements and offerings",
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    tagline: "Payments, billing & financial APIs",
    logo: "💳",
    color: "#635BFF",
    features: ["One-time payments", "Subscriptions", "Invoicing", "Payment links", "Webhooks"],
    docsUrl: "https://stripe.com",
    fields: [
      { key: "stripe_publishable_key", label: "Publishable Key", placeholder: "pk_live_..." },
      { key: "stripe_price_id", label: "Default Price ID", placeholder: "price_..." },
      { key: "stripe_webhook_secret", label: "Webhook Secret", placeholder: "whsec_...", sensitive: true },
    ],
    setupSteps: [
      "Create an account at stripe.com",
      "Add your publishable key above",
      "Create products and price IDs in the Stripe dashboard",
      "Set up webhook endpoints for server-side verification",
    ],
  },
  {
    id: "admob",
    name: "Google AdMob",
    tagline: "Banner, interstitial & rewarded ads",
    logo: "📱",
    color: "#34A853",
    features: ["Banner ads", "Interstitial ads", "Rewarded ads", "Native ads", "Mediation"],
    docsUrl: "https://admob.google.com",
    fields: [
      { key: "admob_app_id_ios", label: "iOS App ID", placeholder: "ca-app-pub-xxxx~xxxxxxxxxx" },
      { key: "admob_app_id_android", label: "Android App ID", placeholder: "ca-app-pub-xxxx~xxxxxxxxxx" },
      { key: "admob_banner_unit_id", label: "Banner Ad Unit ID", placeholder: "ca-app-pub-xxxx/xxxxxxxxxx" },
      { key: "admob_interstitial_unit_id", label: "Interstitial Ad Unit ID", placeholder: "ca-app-pub-xxxx/xxxxxxxxxx" },
      { key: "admob_rewarded_unit_id", label: "Rewarded Ad Unit ID", placeholder: "ca-app-pub-xxxx/xxxxxxxxxx" },
    ],
    setupSteps: [
      "Create an AdMob account at admob.google.com",
      "Register your iOS and Android app",
      "Create banner, interstitial, and rewarded ad units",
      "Paste the app IDs and unit IDs above",
      "Ask the AI to place ad units inside your app screens",
    ],
  },
];

/* ─── Types for Monetization Config ─── */
type MonetizationModel = "freemium" | "subscription" | "one_time" | "consumable" | "ads" | "none";

const MONETIZATION_MODELS: { id: MonetizationModel; label: string; icon: typeof CreditCard; desc: string }[] = [
  { id: "subscription", label: "Subscription", icon: Repeat, desc: "Recurring weekly, monthly, or yearly" },
  { id: "freemium", label: "Freemium", icon: Zap, desc: "Free tier with paid upgrades" },
  { id: "one_time", label: "One-time Purchase", icon: CreditCard, desc: "Unlock once, use forever" },
  { id: "consumable", label: "Consumable", icon: ShoppingBag, desc: "Credits, tokens, virtual currency" },
  { id: "ads", label: "Ads", icon: DollarSign, desc: "Banner, interstitial & rewarded via AdMob" },
];

/* ─── MonetizationPanel Component ─── */
export function MonetizationPanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<MonetizationProvider | null>(null);
  const [selectedModel, setSelectedModel] = useState<MonetizationModel>("subscription");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});

  // Load existing monetization config from project env vars
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) { setLoading(false); return; }
      const { data } = await (supabase as any)
        .from("project_env_vars")
        .select("name, value")
        .eq("project_id", projectId)
        .eq("user_id", u.user.id);
      if (data) {
        const vals: Record<string, string> = {};
        let detectedProvider: MonetizationProvider | null = null;
        let detectedModel: MonetizationModel = "subscription";
        for (const row of data) {
          vals[row.name] = row.value;
          if (row.name.startsWith("adapty_")) detectedProvider = "adapty";
          if (row.name.startsWith("revenuecat_")) detectedProvider = "revenuecat";
          if (row.name.startsWith("stripe_")) detectedProvider = "stripe";
          if (row.name === "monetization_model") detectedModel = row.value as MonetizationModel;
        }
        setFieldValues(vals);
        if (detectedProvider) setSelectedProvider(detectedProvider);
        if (detectedModel) setSelectedModel(detectedModel);
      }
      setLoading(false);
    })();
  }, [projectId]);

  // Save config
  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) throw new Error("Not signed in");
      const uid = u.user.id;

      // Get all field keys for the selected provider + model
      const provider = PROVIDERS.find(p => p.id === selectedProvider);
      const allKeys = [
        ...(provider?.fields.map(f => f.key) ?? []),
        "monetization_provider",
        "monetization_model",
      ];

      // Upsert each env var
      for (const key of allKeys) {
        let value = "";
        if (key === "monetization_provider") value = selectedProvider ?? "";
        else if (key === "monetization_model") value = selectedModel;
        else value = fieldValues[key] ?? "";

        await (supabase as any)
          .from("project_env_vars")
          .upsert(
            {
              project_id: projectId,
              user_id: uid,
              name: key,
              value,
              visible: !provider?.fields.find(f => f.key === key)?.sensitive,
            },
            { onConflict: "project_id,user_id,name" },
          );
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const activeProvider = PROVIDERS.find(p => p.id === selectedProvider);

  if (loading) {
    return (
      <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 lg:flex-none lg:w-[480px] min-h-[60vh] lg:min-h-0 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border flex-col bg-card/40">
      {/* Header */}
      <header className="p-4 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/15 grid place-items-center shrink-0">
            <DollarSign className="h-4.5 w-4.5 text-emerald-500" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-base truncate">Monetization</h2>
            <p className="text-[10px] text-muted-foreground truncate">Set up in-app purchases & subscriptions</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* ─── Step 1: Monetization Model ─── */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">
            Revenue Model
          </label>
          <div className="grid grid-cols-2 gap-2">
            {MONETIZATION_MODELS.map(m => {
              const Icon = m.icon;
              const active = selectedModel === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedModel(m.id)}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-card/40 hover:border-muted-foreground/30"
                  }`}
                >
                  <div className={`h-7 w-7 rounded-lg grid place-items-center shrink-0 ${active ? "bg-primary/15" : "bg-muted/30"}`}>
                    <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0">
                    <span className={`text-[11px] font-semibold block ${active ? "text-foreground" : "text-muted-foreground"}`}>{m.label}</span>
                    <span className="text-[9px] text-muted-foreground line-clamp-1">{m.desc}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Step 2: Payment Provider ─── */}
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">
            Payment Provider
          </label>
          <div className="space-y-2">
            {PROVIDERS.map(p => {
              const active = selectedProvider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProvider(p.id)}
                  className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-card/40 hover:border-muted-foreground/30"
                  }`}
                >
                  <div
                    className="h-10 w-10 rounded-xl grid place-items-center shrink-0 text-lg"
                    style={{ backgroundColor: p.color + "15" }}
                  >
                    {p.logo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{p.name}</span>
                      {active && <Check className="h-3 w-3 text-primary" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{p.tagline}</span>
                  </div>
                  <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${active ? "text-primary rotate-90" : "text-muted-foreground/30"}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Step 3: Provider Configuration ─── */}
        {activeProvider && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Feature badges */}
            <div className="flex flex-wrap gap-1.5">
              {activeProvider.features.map(f => (
                <span key={f} className="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                  {f}
                </span>
              ))}
            </div>

            {/* API Fields */}
            <div className="space-y-3">
              {activeProvider.fields.map(field => (
                <div key={field.key}>
                  <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1 block">
                    {field.label}
                  </label>
                  <div className="relative">
                    <input
                      type={field.sensitive && !showSensitive[field.key] ? "password" : "text"}
                      value={fieldValues[field.key] ?? ""}
                      onChange={e => setFieldValues(v => ({ ...v, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
                    />
                    {field.sensitive && (
                      <button
                        type="button"
                        onClick={() => setShowSensitive(s => ({ ...s, [field.key]: !s[field.key] }))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Dashboard Link */}
            <a
              href={activeProvider.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              Open {activeProvider.name} Dashboard
              <ExternalLink className="h-3 w-3" />
            </a>

            {/* Save Button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </button>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                <p className="text-[11px] text-destructive">{error}</p>
              </div>
            )}

            {/* Setup Guide */}
            <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-primary" />
                How to use {activeProvider.name}:
              </h4>
              <ol className="space-y-1.5">
                {activeProvider.setupSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                    <span className="text-primary font-mono text-[10px] mt-0.5 shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* ─── Generated Code Preview ─── */}
        {activeProvider && (
          <div className="rounded-xl border border-border bg-card/60 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
              <Zap className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Generated Code Preview</span>
            </div>
            <pre className="p-3 text-[10px] leading-relaxed font-mono text-foreground/70 overflow-x-auto max-h-40">
              <code>{getCodePreview(activeProvider.id, selectedModel, fieldValues)}</code>
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Code Preview Generator ─── */
function getCodePreview(provider: MonetizationProvider, model: MonetizationModel, values: Record<string, string>): string {
  switch (provider) {
    case "adapty":
      return `// lib/monetization.ts
import { adapty } from 'react-native-adapty';

// Initialize Adapty
adapty.activate('${values.adapty_api_key || "YOUR_API_KEY"}');

// Show paywall
export async function showPaywall() {
  const paywall = await adapty.getPaywall('${values.adapty_placement_id || "placement_id"}');
  // Present paywall UI to user
  return paywall;
}

// Check subscription status
export async function checkPremium() {
  const profile = await adapty.getProfile();
  return profile.accessLevels['premium']?.isActive ?? false;
}`;

    case "revenuecat":
      return `// lib/monetization.ts
import Purchases from 'react-native-purchases';

// Initialize RevenueCat
Purchases.configure({
  apiKey: '${values.revenuecat_api_key || "YOUR_API_KEY"}'
});

// Get offerings
export async function getOfferings() {
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

// Check entitlement
export async function isPremium() {
  const info = await Purchases.getCustomerInfo();
  return info.entitlements.active['${values.revenuecat_entitlement_id || "premium"}'] !== undefined;
}`;

    case "stripe":
      return `// lib/monetization.ts
import { initStripe } from '@stripe/stripe-react-native';

// Initialize Stripe
initStripe({
  publishableKey: '${values.stripe_publishable_key || "pk_live_..."}',
});

// Create checkout session (call your backend)
export async function createCheckout(priceId: string) {
  const res = await fetch('/api/create-checkout', {
    method: 'POST',
    body: JSON.stringify({ priceId }),
  });
  return res.json();
}`;

    default:
      return "// Select a provider to see generated code";
  }
}
