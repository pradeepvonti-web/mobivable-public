/**
 * Centralized AI provider system for Mobivable.
 * Supports: OpenAI, Google Gemini, Anthropic Claude, Groq, OpenRouter, Ollama (local), and custom endpoints.
 *
 * Environment Variables (set any one or more):
 *   OPENAI_API_KEY       — OpenAI (GPT-4o, GPT-4o-mini, o3, o4-mini)
 *   GOOGLE_AI_API_KEY    — Google AI Studio / Gemini API
 *   ANTHROPIC_API_KEY    — Anthropic (Claude 4 Sonnet, Opus, Haiku)
 *   GROQ_API_KEY         — Groq (Llama, Mixtral — fast inference)
 *   OPENROUTER_API_KEY   — OpenRouter (any model via unified API)
 *   OLLAMA_HOST          — Ollama base URL (default: http://localhost:11434)
 *   OLLAMA_ENABLED       — Set to "true" to enable Ollama (auto-detected if OLLAMA_HOST is set)
 *   AI_PROVIDER          — Override: "openai" | "gemini" | "anthropic" | "groq" | "openrouter" | "ollama"
 *   AI_MODEL             — Override the default model for the selected provider
 *   AI_BASE_URL          — Custom OpenAI-compatible endpoint URL
 */

// ─── Types ──────────────────────────────────────────────────────
export type AIProvider = "lovable" | "openai" | "gemini" | "anthropic" | "groq" | "openrouter" | "ollama" | "custom";

export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIResult =
  | { ok: true; text: string; provider: string; model: string }
  | { ok: false; error: string };

export type AIStreamChunk = { text: string; done: boolean };

type ProviderConfig = {
  id: AIProvider;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: { id: string; label: string }[];
  authHeader: (key: string) => Record<string, string>;
  getKey: () => string | undefined;
};

// ─── Provider Configurations ────────────────────────────────────
const PROVIDERS: Record<AIProvider, ProviderConfig> = {
  lovable: {
    id: "lovable",
    name: "Lovable AI",
    baseUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
    defaultModel: "google/gemini-3-flash-preview",
    models: [
      { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (Lovable)" },
      { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Lovable)" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Lovable)" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (Lovable)" },
      { id: "openai/gpt-5", label: "GPT-5 (Lovable)" },
      { id: "openai/gpt-5-mini", label: "GPT-5 Mini (Lovable)" },
    ],
    authHeader: (key) => ({
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    }),
    getKey: () => process.env.LOVABLE_API_KEY,
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o",
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "o3", label: "o3" },
      { id: "o4-mini", label: "o4-mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    ],
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    getKey: () => process.env.OPENAI_API_KEY,
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    defaultModel: "gemini-2.5-flash",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    getKey: () => process.env.GOOGLE_AI_API_KEY,
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-sonnet-4-20250514",
    models: [
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
      { id: "claude-haiku-4-20250514", label: "Claude Haiku 4" },
    ],
    authHeader: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
    getKey: () => process.env.ANTHROPIC_API_KEY,
  },
  groq: {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B" },
      { id: "mixtral-8x7b-32768", label: "Mixtral 8×7B" },
      { id: "gemma2-9b-it", label: "Gemma 2 9B" },
    ],
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    getKey: () => process.env.GROQ_API_KEY,
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "google/gemini-2.5-flash",
    models: [
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "openai/gpt-4o", label: "GPT-4o" },
      { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
    ],
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    getKey: () => process.env.OPENROUTER_API_KEY,
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    baseUrl: `${process.env.OLLAMA_HOST || "http://localhost:11434"}/v1/chat/completions`,
    defaultModel: "llama3.1",
    models: [
      { id: "llama3.1", label: "Llama 3.1 8B" },
      { id: "llama3.1:70b", label: "Llama 3.1 70B" },
      { id: "llama3.2", label: "Llama 3.2 3B" },
      { id: "codellama", label: "Code Llama" },
      { id: "mistral", label: "Mistral 7B" },
      { id: "mixtral", label: "Mixtral 8×7B" },
      { id: "gemma2", label: "Gemma 2" },
      { id: "qwen2.5-coder", label: "Qwen 2.5 Coder" },
      { id: "deepseek-coder-v2", label: "DeepSeek Coder V2" },
      { id: "phi3", label: "Phi-3" },
    ],
    // Ollama's OpenAI-compatible endpoint does not require auth but
    // accepts a dummy Bearer token for compatibility.
    authHeader: () => ({ Authorization: "Bearer ollama" }),
    getKey: () => {
      // Ollama is "configured" when explicitly enabled or when OLLAMA_HOST is set.
      // No API key is required — it runs locally.
      if (process.env.OLLAMA_ENABLED === "true") return "ollama";
      if (process.env.OLLAMA_HOST) return "ollama";
      if (process.env.AI_PROVIDER === "ollama") return "ollama";
      return undefined;
    },
  },
  custom: {
    id: "custom",
    name: "Custom Endpoint",
    baseUrl: "",
    defaultModel: "default",
    models: [{ id: "default", label: "Default" }],
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    getKey: () => process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY,
  },
};

// ─── Auto-detect active provider ────────────────────────────────
export function detectProvider(): ProviderConfig | null {
  // Check explicit override first
  const explicit = process.env.AI_PROVIDER as AIProvider | undefined;
  if (explicit && PROVIDERS[explicit]) {
    const cfg = PROVIDERS[explicit];
    if (cfg.getKey()) return cfg;
  }

  // Auto-detect by checking which keys are available
  const priority: AIProvider[] = ["lovable", "openai", "gemini", "anthropic", "groq", "openrouter", "ollama"];
  for (const id of priority) {
    const cfg = PROVIDERS[id];
    if (cfg.getKey()) return cfg;
  }

  // Check for custom base URL
  if (process.env.AI_BASE_URL) {
    const custom = { ...PROVIDERS.custom, baseUrl: process.env.AI_BASE_URL };
    return custom;
  }

  return null;
}

/** Get the active provider name for display */
export function getActiveProviderName(): string {
  return detectProvider()?.name ?? "Not configured";
}

/** Get all available models for the active provider */
export function getActiveModels(): { id: string; label: string }[] {
  return detectProvider()?.models ?? [];
}

// ─── Model name mapping (friendly → provider model ID) ──────────
const MODEL_ALIASES: Record<string, Record<string, string>> = {
  lovable: {
    "Gemini 2.5 Flash": "google/gemini-2.5-flash",
    "Gemini 2.5 Pro": "google/gemini-2.5-pro",
    "Gemini 3 Flash": "google/gemini-3-flash-preview",
    "GPT-4o": "openai/gpt-5",
    "GPT-4o Mini": "openai/gpt-5-mini",
    "Claude Sonnet 4": "google/gemini-2.5-pro",
  },
  openai: {
    "Gemini 2.5 Flash": "gpt-4o-mini",
    "Gemini 2.5 Pro": "gpt-4o",
    "Gemini 3 Flash": "gpt-4o",
    "GPT-4o": "gpt-4o",
    "GPT-4o Mini": "gpt-4o-mini",
    "o3": "o3",
    "o4-mini": "o4-mini",
  },
  gemini: {
    "Gemini 2.5 Flash": "gemini-2.5-flash",
    "Gemini 2.5 Pro": "gemini-2.5-pro",
    "Gemini 3 Flash": "gemini-2.0-flash",
    "GPT-4o": "gemini-2.5-pro",
    "GPT-4o Mini": "gemini-2.5-flash",
  },
  anthropic: {
    "Gemini 2.5 Flash": "claude-haiku-4-20250514",
    "Gemini 2.5 Pro": "claude-sonnet-4-20250514",
    "Gemini 3 Flash": "claude-sonnet-4-20250514",
    "GPT-4o": "claude-sonnet-4-20250514",
    "Claude Sonnet 4": "claude-sonnet-4-20250514",
    "Claude Opus 4": "claude-opus-4-20250514",
  },
  groq: {
    "Gemini 2.5 Flash": "llama-3.3-70b-versatile",
    "Gemini 2.5 Pro": "llama-3.3-70b-versatile",
    "Gemini 3 Flash": "llama-3.1-8b-instant",
  },
  ollama: {
    "Gemini 2.5 Flash": "llama3.1",
    "Gemini 2.5 Pro": "llama3.1:70b",
    "Gemini 3 Flash": "llama3.1",
    "GPT-4o": "llama3.1:70b",
    "GPT-4o Mini": "llama3.1",
    "Claude Sonnet 4": "llama3.1:70b",
    "Code Llama": "codellama",
    "Mistral": "mistral",
  },
  openrouter: {
    "Gemini 2.5 Flash": "google/gemini-2.5-flash",
    "Gemini 2.5 Pro": "google/gemini-2.5-pro",
    "Gemini 3 Flash": "google/gemini-2.5-flash",
    "GPT-4o": "openai/gpt-4o",
    "Claude Sonnet 4": "anthropic/claude-sonnet-4",
  },
};

function resolveModel(friendlyName: string, provider: ProviderConfig): string {
  // Check env override
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  // Check alias map
  const aliases = MODEL_ALIASES[provider.id] ?? {};
  if (aliases[friendlyName]) return aliases[friendlyName];
  // Fallback to provider default
  return provider.defaultModel;
}

// ─── Core API: Non-streaming chat completion ────────────────────
export async function callAI(
  system: string,
  user: string,
  modelHint?: string,
): Promise<AIResult> {
  const provider = detectProvider();
  if (!provider) {
    return { ok: false, error: "No AI provider configured. Set OPENAI_API_KEY, GOOGLE_AI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY in your environment variables." };
  }

  const key = provider.getKey();
  if (!key) {
    return { ok: false, error: `${provider.name} API key is missing.` };
  }

  const model = resolveModel(modelHint ?? "", provider);
  const url = provider.baseUrl || process.env.AI_BASE_URL || "";

  try {
    // Anthropic uses a different request format
    if (provider.id === "anthropic") {
      return await callAnthropic(url, key, model, system, user, provider);
    }

    // All other providers use OpenAI-compatible format
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...provider.authHeader(key),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg =
        res.status === 429
          ? "Rate limit reached. Try again shortly."
          : res.status === 401
            ? `${provider.name}: Invalid API key. Check your ${provider.id.toUpperCase()}_API_KEY.`
            : res.status === 402
              ? `${provider.name}: Billing issue. Check your account credits.`
              : `${provider.name} error (${res.status}): ${body.slice(0, 200)}`;
      return { ok: false, error: msg };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    return {
      ok: true,
      text: json.choices?.[0]?.message?.content?.trim() ?? "",
      provider: provider.name,
      model,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `${provider.name}: ${e.message}` : "AI call failed",
    };
  }
}

// ─── Multi-Model Routing (Phase 4) ─────────────────────────────
// Use the right model tier for each task instead of one model for everything.
//   callAIFast   → Flash/Haiku/Mini — routing, classification, verify, quick edits
//   callAIStrong → Pro/Sonnet/GPT-4o — schema gen, code gen, complex reasoning

/** Fast-tier model per provider: cheapest + fastest, good for routing/classify. */
const FAST_MODELS: Record<AIProvider, string> = {
  lovable: "google/gemini-3-flash-preview",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-haiku-4-20250514",
  groq: "llama-3.1-8b-instant",
  openrouter: "google/gemini-2.5-flash",
  ollama: "llama3.1",
  custom: "default",
};

/** Strong-tier model per provider: best quality for generation + reasoning. */
const STRONG_MODELS: Record<AIProvider, string> = {
  lovable: "google/gemini-2.5-pro",
  openai: "gpt-4o",
  gemini: "gemini-2.5-pro",
  anthropic: "claude-sonnet-4-20250514",
  groq: "llama-3.3-70b-versatile",
  openrouter: "google/gemini-2.5-pro",
  ollama: "llama3.1:70b",
  custom: "default",
};

export type ModelTier = "fast" | "strong" | "default";

/**
 * Call AI with the fast-tier model. Use for:
 * - Routing/classification (which agent? which tool?)
 * - Quick verification (verify_schema analysis)
 * - Short responses (under 200 tokens)
 * - Tool argument parsing
 */
export async function callAIFast(
  system: string,
  user: string,
): Promise<AIResult> {
  const provider = detectProvider();
  if (!provider) return { ok: false, error: "No AI provider configured." };
  const model = FAST_MODELS[provider.id] ?? provider.defaultModel;
  return callAI(system, user, model);
}

/**
 * Call AI with the strong-tier model. Use for:
 * - Full app schema generation
 * - Code generation (React Native / Flutter)
 * - Complex multi-step reasoning
 * - Architectural decisions
 */
export async function callAIStrong(
  system: string,
  user: string,
): Promise<AIResult> {
  const provider = detectProvider();
  if (!provider) return { ok: false, error: "No AI provider configured." };
  const model = STRONG_MODELS[provider.id] ?? provider.defaultModel;
  return callAI(system, user, model);
}

/**
 * Streaming tool-use call with model tier selection.
 * Default tier for the agent loop is "fast" since surgical edits are
 * cheap operations. Code generation uses "strong".
 */
export async function callAIToolsStreamingTiered(
  args: {
    system: string;
    messages: ProviderNeutralMsg;
    tools: { anthropic: AnthropicToolDef[]; openai: OpenAIToolDef[] };
    modelHint?: string;
    tier?: ModelTier;
  },
): Promise<
  | { ok: true; response: Response; provider: AIProvider; model: string }
  | { ok: false; error: string }
> {
  const provider = detectProvider();
  if (!provider) return { ok: false, error: "No AI provider configured." };

  // Resolve model: explicit hint > tier > default
  let model: string;
  if (args.modelHint) {
    model = resolveModel(args.modelHint, provider);
  } else if (args.tier === "fast") {
    model = FAST_MODELS[provider.id] ?? provider.defaultModel;
  } else if (args.tier === "strong") {
    model = STRONG_MODELS[provider.id] ?? provider.defaultModel;
  } else {
    model = resolveModel("", provider);
  }

  return callAIToolsStreaming({
    ...args,
    modelHint: model,
  });
}

// ─── Anthropic-specific format ──────────────────────────────────
async function callAnthropic(
  url: string,
  key: string,
  model: string,
  system: string,
  user: string,
  provider: ProviderConfig,
): Promise<AIResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...provider.authHeader(key),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error: res.status === 429
        ? "Anthropic rate limit reached."
        : `Anthropic error (${res.status}): ${body.slice(0, 200)}`,
    };
  }

  const json = (await res.json()) as {
    content?: { type: string; text: string }[];
  };

  return {
    ok: true,
    text: json.content?.find(c => c.type === "text")?.text?.trim() ?? "",
    provider: provider.name,
    model,
  };
}

// ─── Vision API: non-streaming chat with image inputs ──────────
//
// Sends one or more images alongside a text prompt and returns the model's
// text reply. Used by the "clone an app from its store listing" flow to turn
// store screenshots into a structured spec.
//
// Image inputs are passed as URLs (e.g. App Store CDN screenshot URLs). Every
// provider we target accepts remote image URLs:
//   - OpenAI-compatible (OpenAI, Gemini openai-compat, OpenRouter): the
//     `image_url` content-part form used elsewhere in the codebase.
//   - Anthropic: the `source: { type: "url" }` image block.
//
// Providers without vision (Groq's Llama, Mixtral) will reject the request;
// the error surfaces to the caller so the user can switch models rather than
// us silently degrading.
const MAX_VISION_IMAGES = 10;

export async function callAIVision(
  system: string,
  user: string,
  imageUrls: string[],
  modelHint?: string,
): Promise<AIResult> {
  const provider = detectProvider();
  if (!provider) {
    return { ok: false, error: "No AI provider configured. Set an API key in environment variables." };
  }
  const key = provider.getKey();
  if (!key) return { ok: false, error: `${provider.name} API key is missing.` };

  const images = imageUrls.filter((u) => /^https?:\/\//i.test(u)).slice(0, MAX_VISION_IMAGES);
  if (images.length === 0) {
    return { ok: false, error: "No valid image URLs provided for vision analysis." };
  }

  const model = resolveModel(modelHint ?? "", provider);
  const url = provider.baseUrl || process.env.AI_BASE_URL || "";

  try {
    if (provider.id === "anthropic") {
      const res = await fetch(url, {
        method: "POST",
        headers: { ...provider.authHeader(key), "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          system,
          messages: [
            {
              role: "user",
              content: [
                ...images.map((u) => ({ type: "image", source: { type: "url", url: u } })),
                { type: "text", text: user },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          error: res.status === 429
            ? "Anthropic rate limit reached."
            : `Anthropic vision error (${res.status}): ${body.slice(0, 200)}`,
        };
      }
      const json = (await res.json()) as { content?: { type: string; text: string }[] };
      return {
        ok: true,
        text: json.content?.find((c) => c.type === "text")?.text?.trim() ?? "",
        provider: provider.name,
        model,
      };
    }

    // OpenAI-compatible providers: image_url content parts.
    const res = await fetch(url, {
      method: "POST",
      headers: { ...provider.authHeader(key), "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              ...images.map((u) => ({ type: "image_url", image_url: { url: u } })),
              { type: "text", text: user },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg =
        res.status === 429
          ? "Rate limit reached. Try again shortly."
          : res.status === 401
            ? `${provider.name}: Invalid API key.`
            : `${provider.name} vision error (${res.status}): ${body.slice(0, 200)}`;
      return { ok: false, error: msg };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return {
      ok: true,
      text: json.choices?.[0]?.message?.content?.trim() ?? "",
      provider: provider.name,
      model,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? `${provider.name}: ${e.message}` : "Vision call failed",
    };
  }
}

// ─── Streaming API (OpenAI-compatible only) ─────────────────────
export async function callAIStreaming(
  messages: AIMessage[],
  modelHint?: string,
): Promise<{ ok: true; response: Response; provider: string; model: string } | { ok: false; error: string }> {
  const provider = detectProvider();
  if (!provider) {
    return { ok: false, error: "No AI provider configured. Set an API key in environment variables." };
  }

  const key = provider.getKey();
  if (!key) return { ok: false, error: `${provider.name} API key missing.` };

  const model = resolveModel(modelHint ?? "", provider);
  const url = provider.baseUrl || process.env.AI_BASE_URL || "";

  // For Anthropic streaming, convert to their format
  if (provider.id === "anthropic") {
    const systemMsg = messages.find(m => m.role === "system")?.content ?? "";
    const nonSystemMsgs = messages.filter(m => m.role !== "system");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...provider.authHeader(key),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: systemMsg,
        messages: nonSystemMsgs,
        stream: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `${provider.name} error (${res.status}): ${body.slice(0, 200)}` };
    }

    return { ok: true, response: res, provider: provider.name, model };
  }

  // OpenAI-compatible streaming
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...provider.authHeader(key),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `${provider.name} error (${res.status}): ${body.slice(0, 200)}` };
  }

  return { ok: true, response: res, provider: provider.name, model };
}

// ─── Streaming API with tool use (Anthropic + OpenAI-compat) ───
//
// Used by the in-studio MCP agent loop. Differences from callAIStreaming:
//   - Tools are passed to the model so it can emit tool_use blocks.
//   - Caller gets back the active provider id so they can parse the SSE
//     in the right shape (Anthropic uses content_block_* events; OpenAI
//     uses choices[].delta.tool_calls).
//   - System prompt is taken separately because Anthropic puts it in a
//     top-level `system` field, not a message.
//
// Why a separate function from callAIStreaming: tool-use requests have
// strictly different request bodies (tools array, tool_choice, etc.), and
// the response stream events need different parsing. Forking the function
// is cleaner than threading a half-dozen optional flags.

export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface OpenAIToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ProviderNeutralMsg {
  /** Pre-converted messages — caller already shaped them per provider. */
  anthropic?: { role: "user" | "assistant"; content: unknown }[];
  openai?: {
    role: "system" | "user" | "assistant" | "tool";
    // Widened to `unknown` because multimodal user messages carry an
    // array of content parts (image_url + text), not a plain string.
    // The caller already shaped it per OpenAI's spec.
    content: unknown;
    tool_calls?: unknown[];
    tool_call_id?: string;
    name?: string;
  }[];
}

export async function callAIToolsStreaming(args: {
  system: string;
  messages: ProviderNeutralMsg;
  tools: { anthropic: AnthropicToolDef[]; openai: OpenAIToolDef[] };
  modelHint?: string;
}): Promise<
  | { ok: true; response: Response; provider: AIProvider; model: string }
  | { ok: false; error: string }
> {
  const provider = detectProvider();
  if (!provider) {
    return { ok: false, error: "No AI provider configured." };
  }
  const key = provider.getKey();
  if (!key) return { ok: false, error: `${provider.name} API key missing.` };
  const model = resolveModel(args.modelHint ?? "", provider);
  const url = provider.baseUrl || process.env.AI_BASE_URL || "";

  if (provider.id === "anthropic") {
    const body = {
      model,
      max_tokens: 8192,
      system: args.system,
      messages: args.messages.anthropic ?? [],
      tools: args.tools.anthropic,
      stream: true,
    };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...provider.authHeader(key),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Anthropic error (${res.status}): ${text.slice(0, 200)}` };
    }
    return { ok: true, response: res, provider: provider.id, model };
  }

  // All other providers speak the OpenAI tool-calls protocol. Some (Gemini
  // via Google's OpenAI-compat endpoint, Groq) reject tool-use in streaming
  // mode — the caller surfaces those errors so the user knows to switch
  // models, rather than us trying to silently fall back.
  const body = {
    model,
    messages: args.messages.openai ?? [],
    tools: args.tools.openai,
    tool_choice: "auto" as const,
    stream: true,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...provider.authHeader(key),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `${provider.name} error (${res.status}): ${text.slice(0, 200)}`,
    };
  }
  return { ok: true, response: res, provider: provider.id, model };
}

// ─── Image generation (for asset creation) ──────────────────────
export async function callAIImage(
  prompt: string,
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  const provider = detectProvider();
  if (!provider) {
    return { ok: false, error: "No AI provider configured." };
  }

  const key = provider.getKey();
  if (!key) return { ok: false, error: `${provider.name} API key missing.` };

  // Lovable AI Gateway (Nano Banana via google/gemini-2.5-flash-image)
  if (provider.id === "lovable") {
    try {
      const res = await fetch(provider.baseUrl, {
        method: "POST",
        headers: {
          ...provider.authHeader(key),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `Lovable AI Image error (${res.status}): ${body.slice(0, 200)}` };
      }
      const json = (await res.json()) as {
        choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
      };
      const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!dataUrl?.startsWith("data:image/")) return { ok: false, error: "No image returned" };
      return { ok: true, dataUrl };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Image generation failed" };
    }
  }

  // OpenAI image generation
  if (provider.id === "openai") {
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          n: 1,
          size: "1024x1024",
          quality: "medium",
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `OpenAI Image error (${res.status}): ${body.slice(0, 200)}` };
      }
      const json = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) return { ok: false, error: "No image returned" };
      return { ok: true, dataUrl: `data:image/png;base64,${b64}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Image generation failed" };
    }
  }

  // Gemini with image modality
  if (provider.id === "gemini") {
    try {
      const res = await fetch(provider.baseUrl, {
        method: "POST",
        headers: {
          ...provider.authHeader(key),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.0-flash-preview-image-generation",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `Gemini Image error (${res.status}): ${body.slice(0, 200)}` };
      }
      const json = (await res.json()) as {
        choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
      };
      const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!dataUrl?.startsWith("data:image/")) return { ok: false, error: "No image returned" };
      return { ok: true, dataUrl };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Image generation failed" };
    }
  }

  // Fallback for providers that don't support image gen natively
  return { ok: false, error: `${provider.name} does not support image generation. Use OpenAI or Gemini.` };
}

// ─── Provider status (for UI display) ───────────────────────────
export type ProviderStatus = {
  id: AIProvider;
  name: string;
  configured: boolean;
  models: { id: string; label: string }[];
  isActive: boolean;
};

export function getProviderStatuses(): ProviderStatus[] {
  const active = detectProvider();
  return (Object.values(PROVIDERS) as ProviderConfig[])
    .filter(p => p.id !== "custom" && p.id !== "lovable")
    .map(p => ({
      id: p.id,
      name: p.name,
      configured: !!p.getKey(),
      models: p.models,
      isActive: active?.id === p.id,
    }));
}
