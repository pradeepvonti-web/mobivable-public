import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectImageProvider, detectProvider } from "./ai-provider";

// Env keys that influence provider selection. Saved/restored around each test
// so cases don't leak into one another (getKey()/detectProvider read live env).
const ENV_KEYS = [
  "AI_PROVIDER",
  "AI_IMAGE_PROVIDER",
  "LOVABLE_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "ANTHROPIC_API_KEY",
  "VERTEX_AI_SERVICE_ACCOUNT",
] as const;

describe("detectImageProvider — image gen decoupled from the text brain", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("routes images to Lovable even when the text brain is Anthropic (the mockup bug)", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.LOVABLE_API_KEY = "lov-test";

    // Text brain is Anthropic…
    expect(detectProvider()?.id).toBe("anthropic");
    // …but images decouple to an image-capable provider.
    expect(detectImageProvider()?.id).toBe("lovable");
  });

  it("falls back to OpenAI for images when Lovable is absent but the brain is Anthropic", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-openai-test";

    expect(detectProvider()?.id).toBe("anthropic");
    expect(detectImageProvider()?.id).toBe("openai");
  });

  it("honors the AI_IMAGE_PROVIDER override when that provider is keyed", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.LOVABLE_API_KEY = "lov-test";
    process.env.GOOGLE_AI_API_KEY = "g-test";
    process.env.AI_IMAGE_PROVIDER = "gemini";

    expect(detectImageProvider()?.id).toBe("gemini");
  });

  it("ignores AI_IMAGE_PROVIDER when that provider has no key (falls through)", () => {
    process.env.AI_IMAGE_PROVIDER = "openai"; // no OPENAI_API_KEY set
    process.env.LOVABLE_API_KEY = "lov-test";

    expect(detectImageProvider()?.id).toBe("lovable");
  });

  it("reuses the active text provider for images when it is itself image-capable", () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GOOGLE_AI_API_KEY = "g-test";

    expect(detectProvider()?.id).toBe("gemini");
    expect(detectImageProvider()?.id).toBe("gemini");
  });

  it("returns null when no image-capable provider is configured", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";

    expect(detectImageProvider()).toBeNull();
  });
});
