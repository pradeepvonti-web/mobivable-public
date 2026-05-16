import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PreviewConfig = {
  projectsTable: string;
  projectsListFields: { id: string; name: string; createdAt: string };
  projectDetailFields: {
    id: string;
    name: string;
    prompt: string;
    model: string;
    status: string;
    createdAt: string;
    result: string;
  };
  messagesTable: string;
  messagesFields: {
    id: string;
    role: string;
    content: string;
    projectFk: string;
    createdAt: string;
  };
  visibility: {
    header: boolean;
    pitch: boolean;
    features: boolean;
    screens: boolean;
    palette: boolean;
    dataModel: boolean;
    chat: boolean;
  };
};

export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
  projectsTable: "projects",
  projectsListFields: { id: "id", name: "name", createdAt: "created_at" },
  projectDetailFields: {
    id: "id",
    name: "name",
    prompt: "prompt",
    model: "model",
    status: "status",
    createdAt: "created_at",
    result: "result",
  },
  messagesTable: "project_messages",
  messagesFields: {
    id: "id",
    role: "role",
    content: "content",
    projectFk: "project_id",
    createdAt: "created_at",
  },
  visibility: {
    header: true,
    pitch: true,
    features: true,
    screens: true,
    palette: true,
    dataModel: true,
    chat: true,
  },
};

export const PREVIEW_CONFIG_KEY = "preview_config";

function merge(value: unknown): PreviewConfig {
  const v = (value ?? {}) as Partial<PreviewConfig>;
  return {
    ...DEFAULT_PREVIEW_CONFIG,
    ...v,
    projectsListFields: {
      ...DEFAULT_PREVIEW_CONFIG.projectsListFields,
      ...(v.projectsListFields ?? {}),
    },
    projectDetailFields: {
      ...DEFAULT_PREVIEW_CONFIG.projectDetailFields,
      ...(v.projectDetailFields ?? {}),
    },
    messagesFields: {
      ...DEFAULT_PREVIEW_CONFIG.messagesFields,
      ...(v.messagesFields ?? {}),
    },
    visibility: {
      ...DEFAULT_PREVIEW_CONFIG.visibility,
      ...(v.visibility ?? {}),
    },
  };
}

export async function fetchPreviewConfig(): Promise<PreviewConfig> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", PREVIEW_CONFIG_KEY)
    .maybeSingle();
  return merge((data as { value: unknown } | null)?.value);
}

export async function savePreviewConfig(cfg: PreviewConfig): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: PREVIEW_CONFIG_KEY, value: cfg, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export function usePreviewConfig() {
  const [config, setConfig] = useState<PreviewConfig>(DEFAULT_PREVIEW_CONFIG);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    fetchPreviewConfig().then((c) => {
      if (!active) return;
      setConfig(c);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return { config, loaded };
}

/** Build a Supabase select string with aliases so callers can read canonical keys
 * (e.g. "id, name") regardless of the underlying column names. */
export function aliasedSelect(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([alias, col]) => (alias === col ? alias : `${alias}:${col}`))
    .join(", ");
}
