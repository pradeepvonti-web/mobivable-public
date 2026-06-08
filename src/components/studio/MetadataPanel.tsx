/**
 * MetadataPanel — App Store metadata & legal documents
 *
 * Provides:
 *   - Data Collection checkboxes (what data the app collects)
 *   - AI-generated Privacy Policy
 *   - AI-generated Terms of Use
 *   - Save/persist to Supabase project metadata
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, Sparkles, Save, CheckCircle2, Loader2,
  MapPin, Users, Bell, ImageIcon, Heart, Camera, BarChart3,
  Radio, Mic, CreditCard,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateLegalDoc } from "@/lib/legal-gen.functions";
import { useServerFn } from "@tanstack/react-start";

/* ─── Data Collection Categories ─────────────────────────── */

const DATA_CATEGORIES = [
  { key: "geolocation", label: "Geolocation", icon: MapPin },
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "push_notifications", label: "Push notifications", icon: Bell },
  { key: "photos_media", label: "Photos / Media", icon: ImageIcon },
  { key: "health_fitness", label: "Health / Fitness data", icon: Heart },
  { key: "camera_access", label: "Camera access", icon: Camera },
  { key: "analytics", label: "Analytics / Usage data", icon: BarChart3 },
  { key: "advertising_id", label: "Advertising ID", icon: Radio },
  { key: "microphone", label: "Microphone", icon: Mic },
  { key: "financial_payment", label: "Financial / Payment data", icon: CreditCard },
] as const;

type DataKey = (typeof DATA_CATEGORIES)[number]["key"];

/* ─── Types ──────────────────────────────────────────────── */

type MetadataState = {
  acknowledged: boolean;
  dataCollection: Record<DataKey, boolean>;
  privacyPolicy: string;
  termsOfUse: string;
};

const DEFAULT_STATE: MetadataState = {
  acknowledged: false,
  dataCollection: Object.fromEntries(DATA_CATEGORIES.map((c) => [c.key, false])) as Record<DataKey, boolean>,
  privacyPolicy: "",
  termsOfUse: "",
};

/* ─── Component ──────────────────────────────────────────── */

export function MetadataPanel({ projectId }: { projectId: string }) {
  const [state, setState] = useState<MetadataState>(DEFAULT_STATE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [generatingPolicy, setGeneratingPolicy] = useState(false);
  const [generatingTerms, setGeneratingTerms] = useState(false);
  const [projectName, setProjectName] = useState("My App");

  const genLegalDoc = useServerFn(generateLegalDoc);

  // ── Load persisted metadata ──
  useEffect(() => {
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("projects")
        .select("name, metadata")
        .eq("id", projectId)
        .single();
      if (data) {
        setProjectName((data as Record<string, unknown>).name as string ?? "My App");
        const md = (data as Record<string, unknown>).metadata as Record<string, unknown> | null;
        if (md?.legal) {
          const legal = md.legal as Record<string, unknown>;
          setState({
            acknowledged: (legal.acknowledged as boolean) ?? false,
            dataCollection: {
              ...DEFAULT_STATE.dataCollection,
              ...(legal.dataCollection as Record<string, boolean> ?? {}),
            },
            privacyPolicy: (legal.privacyPolicy as string) ?? "",
            termsOfUse: (legal.termsOfUse as string) ?? "",
          });
        }
      }
    })();
  }, [projectId]);

  // ── Toggle data collection checkbox ──
  const toggleData = (key: DataKey) => {
    setState((prev) => ({
      ...prev,
      dataCollection: { ...prev.dataCollection, [key]: !prev.dataCollection[key] },
    }));
    setSaved(false);
  };

  // ── Generate Privacy Policy ──
  const generatePrivacy = useCallback(async () => {
    setGeneratingPolicy(true);
    try {
      const collected = DATA_CATEGORIES.filter((c) => state.dataCollection[c.key]).map((c) => c.label);
      const result = await genLegalDoc({
        data: {
          type: "privacy",
          appName: projectName,
          dataCollected: collected,
        },
      });
      setState((prev) => ({ ...prev, privacyPolicy: result.text }));
      setSaved(false);
      toast.success("Privacy Policy generated");
    } catch (e) {
      toast.error("Failed to generate: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setGeneratingPolicy(false);
    }
  }, [projectName, state.dataCollection, genLegalDoc]);

  // ── Generate Terms of Use ──
  const generateTerms = useCallback(async () => {
    setGeneratingTerms(true);
    try {
      const result = await genLegalDoc({
        data: {
          type: "terms",
          appName: projectName,
          dataCollected: [],
        },
      });
      setState((prev) => ({ ...prev, termsOfUse: result.text }));
      setSaved(false);
      toast.success("Terms of Use generated");
    } catch (e) {
      toast.error("Failed to generate: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setGeneratingTerms(false);
    }
  }, [projectName, genLegalDoc]);

  // ── Save to Supabase ──
  const handleSave = async () => {
    setSaving(true);
    try {
      // Read existing metadata first to merge
      const { data: existing } = await supabase
        .from("projects")
        .select("metadata")
        .eq("id", projectId)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingMd = ((existing as any)?.metadata as Record<string, unknown>) ?? {};

      await supabase
        .from("projects")
        .update({
          metadata: {
            ...existingMd,
            legal: {
              acknowledged: state.acknowledged,
              dataCollection: state.dataCollection,
              privacyPolicy: state.privacyPolicy,
              termsOfUse: state.termsOfUse,
              updatedAt: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .eq("id", projectId);

      setSaved(true);
      toast.success("Legal documents saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Disclaimer ── */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3 mb-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            These documents are <strong className="text-foreground">AI-generated drafts</strong> intended as a starting
            point. They are not legal advice and may not comply with all applicable laws or regulations.
          </p>
        </div>
        <label className="flex items-start gap-3 cursor-pointer group pl-8">
          <div
            onClick={() => { setState((p) => ({ ...p, acknowledged: !p.acknowledged })); setSaved(false); }}
            className={`h-[18px] w-[18px] rounded border-2 shrink-0 mt-0.5 grid place-items-center transition-all ${
              state.acknowledged
                ? "bg-primary border-primary"
                : "border-border group-hover:border-primary/50"
            }`}
          >
            {state.acknowledged && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
          </div>
          <span className="text-xs text-muted-foreground leading-relaxed">
            I understand that I am responsible for reviewing, editing, and ensuring the accuracy and legal
            compliance of these documents before use.
          </span>
        </label>
      </div>

      {/* ── Data Collection ── */}
      <div className="rounded-xl border border-border bg-card/50 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">Data Collection</h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          What data does your app collect? This applies to both documents.
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {DATA_CATEGORIES.map((cat) => {
            const IconComp = cat.icon;
            const isChecked = state.dataCollection[cat.key];
            return (
              <label
                key={cat.key}
                className="flex items-center gap-2.5 cursor-pointer group"
                onClick={() => toggleData(cat.key)}
              >
                <div
                  className={`h-[18px] w-[18px] rounded-full border-2 shrink-0 grid place-items-center transition-all ${
                    isChecked
                      ? "bg-primary border-primary"
                      : "border-border/60 group-hover:border-primary/50"
                  }`}
                >
                  {isChecked && <div className="h-2 w-2 rounded-full bg-primary-foreground" />}
                </div>
                <IconComp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground">{cat.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* ── Privacy Policy ── */}
      <div className="rounded-xl border border-border bg-card/50 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Privacy Policy</h3>
        <button
          type="button"
          onClick={generatePrivacy}
          disabled={generatingPolicy}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 transition-colors disabled:opacity-50 mb-3"
        >
          {generatingPolicy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {generatingPolicy ? "Generating…" : "Generate Privacy Policy"}
        </button>
        <textarea
          value={state.privacyPolicy}
          onChange={(e) => { setState((p) => ({ ...p, privacyPolicy: e.target.value })); setSaved(false); }}
          placeholder="Privacy Policy text will appear here after generation. You can also type directly."
          rows={10}
          className="w-full rounded-lg border border-border bg-background/50 p-3 text-xs text-foreground placeholder:text-muted-foreground/50 resize-y outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all font-mono leading-relaxed"
        />
      </div>

      {/* ── Terms of Use ── */}
      <div className="rounded-xl border border-border bg-card/50 p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Terms of Use</h3>
        <button
          type="button"
          onClick={generateTerms}
          disabled={generatingTerms}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 transition-colors disabled:opacity-50 mb-3"
        >
          {generatingTerms ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {generatingTerms ? "Generating…" : "Generate Terms of Use"}
        </button>
        <textarea
          value={state.termsOfUse}
          onChange={(e) => { setState((p) => ({ ...p, termsOfUse: e.target.value })); setSaved(false); }}
          placeholder="Terms of Use text will appear here after generation. You can also type directly."
          rows={10}
          className="w-full rounded-lg border border-border bg-background/50 p-3 text-xs text-foreground placeholder:text-muted-foreground/50 resize-y outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all font-mono leading-relaxed"
        />
      </div>

      {/* ── Save Button ── */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : saved ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? "Saving…" : saved ? "Saved!" : "Save Documents"}
      </button>
    </div>
  );
}
