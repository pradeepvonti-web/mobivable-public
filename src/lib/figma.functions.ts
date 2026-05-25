import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callAI } from "./ai-provider";
import { consumeOrThrow, CREDIT_COSTS } from "./credits.server";

// ---------------------------------------------------------------------------
// Figma URL parser
// ---------------------------------------------------------------------------

export type ParsedFigmaUrl = {
  fileKey: string;
  nodeId?: string;
};

export function parseFigmaUrl(url: string): ParsedFigmaUrl | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("figma.com")) return null;

    // Matches /file/<key>/... or /design/<key>/...
    const match = u.pathname.match(/\/(file|design)\/([A-Za-z0-9]+)/);
    if (!match) return null;

    const fileKey = match[2];

    // node-id can appear as ?node-id=1-2 or ?node-id=1:2
    const rawNodeId = u.searchParams.get("node-id");
    const nodeId = rawNodeId ? rawNodeId.replace(/-/g, ":") : undefined;

    return { fileKey, nodeId };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Figma API helpers (server-only)
// ---------------------------------------------------------------------------

const FIGMA_API = "https://api.figma.com/v1";

async function figmaFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${FIGMA_API}${path}`, {
    headers: { "X-Figma-Token": token },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Figma API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Design token extraction helpers
// ---------------------------------------------------------------------------

type RGBA = { r: number; g: number; b: number; a: number };

function rgbaToHex({ r, g, b }: RGBA): string {
  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function extractColors(node: any, set: Set<string>) {
  if (!node) return;
  for (const fill of node.fills ?? []) {
    if (fill.type === "SOLID" && fill.color) {
      set.add(rgbaToHex(fill.color));
    }
  }
  for (const stroke of node.strokes ?? []) {
    if (stroke.type === "SOLID" && stroke.color) {
      set.add(rgbaToHex(stroke.color));
    }
  }
  if (node.backgroundColor) {
    set.add(rgbaToHex(node.backgroundColor));
  }
  for (const child of node.children ?? []) {
    extractColors(child, set);
  }
}

type TypographyToken = {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight?: number | string;
};

function extractTypography(node: any, list: TypographyToken[]) {
  if (!node) return;
  if (node.style) {
    const s = node.style;
    if (s.fontFamily) {
      const exists = list.some(
        (t) =>
          t.fontFamily === s.fontFamily &&
          t.fontSize === s.fontSize &&
          t.fontWeight === s.fontWeight,
      );
      if (!exists) {
        list.push({
          fontFamily: s.fontFamily,
          fontWeight: s.fontWeight ?? 400,
          fontSize: s.fontSize ?? 16,
          lineHeight: s.lineHeightPx ?? s.lineHeightPercent,
        });
      }
    }
  }
  for (const child of node.children ?? []) {
    extractTypography(child, list);
  }
}

type ComponentToken = {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
};

function extractComponents(
  node: any,
  list: ComponentToken[],
  maxItems = 50,
) {
  if (!node || list.length >= maxItems) return;
  if (
    node.type === "COMPONENT" ||
    node.type === "COMPONENT_SET" ||
    node.type === "INSTANCE"
  ) {
    list.push({
      id: node.id,
      name: node.name,
      type: node.type,
      width: node.absoluteBoundingBox?.width,
      height: node.absoluteBoundingBox?.height,
    });
  }
  for (const child of node.children ?? []) {
    extractComponents(child, list, maxItems);
  }
}

type LayoutToken = {
  nodeId: string;
  name: string;
  layoutMode?: string;
  padding?: { top: number; right: number; bottom: number; left: number };
  gap?: number;
  width?: number;
  height?: number;
};

function extractLayout(node: any, list: LayoutToken[], maxItems = 30) {
  if (!node || list.length >= maxItems) return;
  if (node.layoutMode) {
    list.push({
      nodeId: node.id,
      name: node.name,
      layoutMode: node.layoutMode,
      padding: {
        top: node.paddingTop ?? 0,
        right: node.paddingRight ?? 0,
        bottom: node.paddingBottom ?? 0,
        left: node.paddingLeft ?? 0,
      },
      gap: node.itemSpacing,
      width: node.absoluteBoundingBox?.width,
      height: node.absoluteBoundingBox?.height,
    });
  }
  for (const child of node.children ?? []) {
    extractLayout(child, list, maxItems);
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FigmaDesignTokens = {
  fileName: string;
  colors: string[];
  typography: TypographyToken[];
  components: ComponentToken[];
  layout: LayoutToken[];
};

// ---------------------------------------------------------------------------
// Server function: extractFigmaDesign
// ---------------------------------------------------------------------------

export const extractFigmaDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().min(1),
        figmaUrl: z.string().url(),
        figmaToken: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const parsed = parseFigmaUrl(data.figmaUrl);
    if (!parsed) {
      return { ok: false as const, error: "Invalid Figma URL" };
    }

    try {
      let rootNode: any;
      let fileName = "";

      if (parsed.nodeId) {
        // Fetch specific node
        const nodeData = await figmaFetch<any>(
          `/files/${parsed.fileKey}/nodes?ids=${encodeURIComponent(parsed.nodeId)}`,
          data.figmaToken,
        );
        fileName = nodeData.name ?? parsed.fileKey;
        const nodes = nodeData.nodes ?? {};
        const firstKey = Object.keys(nodes)[0];
        rootNode = nodes[firstKey]?.document;
      } else {
        // Fetch entire file (depth=2 to keep payload manageable)
        const fileData = await figmaFetch<any>(
          `/files/${parsed.fileKey}?depth=3`,
          data.figmaToken,
        );
        fileName = fileData.name ?? parsed.fileKey;
        rootNode = fileData.document;
      }

      if (!rootNode) {
        return { ok: false as const, error: "No document node found in Figma response" };
      }

      const colorSet = new Set<string>();
      extractColors(rootNode, colorSet);

      const typography: TypographyToken[] = [];
      extractTypography(rootNode, typography);

      const components: ComponentToken[] = [];
      extractComponents(rootNode, components);

      const layout: LayoutToken[] = [];
      extractLayout(rootNode, layout);

      const tokens: FigmaDesignTokens = {
        fileName,
        colors: Array.from(colorSet),
        typography: typography.sort((a, b) => b.fontSize - a.fontSize),
        components,
        layout,
      };

      return { ok: true as const, tokens };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Figma API error",
      };
    }
  });

// ---------------------------------------------------------------------------
// Server function: exportFigmaImage
// ---------------------------------------------------------------------------

export const exportFigmaImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        figmaUrl: z.string().url(),
        figmaToken: z.string().min(1),
        format: z.enum(["png", "svg"]).default("png"),
        scale: z.number().min(0.5).max(4).default(2),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const parsed = parseFigmaUrl(data.figmaUrl);
    if (!parsed) {
      return { ok: false as const, error: "Invalid Figma URL" };
    }

    // We need a node id to export an image; if none was in the URL,
    // fetch the file and use the first page's first frame.
    let nodeId = parsed.nodeId;
    if (!nodeId) {
      try {
        const fileData = await figmaFetch<any>(
          `/files/${parsed.fileKey}?depth=1`,
          data.figmaToken,
        );
        const firstPage = fileData.document?.children?.[0];
        if (!firstPage) {
          return { ok: false as const, error: "No pages found in file" };
        }
        nodeId = firstPage.id;
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : "Figma API error",
        };
      }
    }

    try {
      const imgData = await figmaFetch<any>(
        `/images/${parsed.fileKey}?ids=${encodeURIComponent(nodeId!)}&format=${data.format}&scale=${data.scale}`,
        data.figmaToken,
      );

      const images: Record<string, string> = imgData.images ?? {};
      const imageUrl = Object.values(images)[0];

      if (!imageUrl) {
        return { ok: false as const, error: "Figma did not return an image URL" };
      }

      return { ok: true as const, imageUrl };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Image export failed",
      };
    }
  });

export const saveFigmaTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        tokens: z.any(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("projects")
      .update({ figma_tokens: data.tokens })
      .eq("id", data.projectId)
      .eq("user_id", userId);

    if (error) {
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });

function simplifyFigmaNode(node: any): any {
  if (!node) return null;

  const result: any = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if (node.layoutMode) result.layoutMode = node.layoutMode;
  if (typeof node.itemSpacing === "number") result.itemSpacing = node.itemSpacing;

  const padding = {
    top: node.paddingTop ?? 0,
    right: node.paddingRight ?? 0,
    bottom: node.paddingBottom ?? 0,
    left: node.paddingLeft ?? 0,
  };
  if (padding.top || padding.right || padding.bottom || padding.left) {
    result.padding = padding;
  }

  if (node.absoluteBoundingBox) {
    result.width = Math.round(node.absoluteBoundingBox.width);
    result.height = Math.round(node.absoluteBoundingBox.height);
  }

  if (node.type === "TEXT" && node.characters) {
    result.text = node.characters.slice(0, 300);
  }

  if (node.fills) {
    const imageFill = node.fills.find((f: any) => f.type === "IMAGE");
    if (imageFill) {
      result.isImage = true;
    }
    const solidFill = node.fills.find((f: any) => f.type === "SOLID");
    if (solidFill && solidFill.color) {
      const toHex = (n: number) =>
        Math.round(n * 255)
          .toString(16)
          .padStart(2, "0");
      const { r, g, b } = solidFill.color;
      result.color = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
  }

  if (node.children && node.children.length > 0) {
    result.children = node.children
      .map((c: any) => simplifyFigmaNode(c))
      .filter(Boolean)
      .slice(0, 30);
  }

  return result;
}

export const compileFigmaToSchema = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        figmaUrl: z.string().url(),
        figmaToken: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const parsed = parseFigmaUrl(data.figmaUrl);
    if (!parsed) {
      return { ok: false as const, error: "Invalid Figma URL" };
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id, prompt, name, result, user_id")
      .eq("id", data.projectId)
      .single();
    if (!project || project.user_id !== userId) {
      return { ok: false as const, error: "Project not found or access denied" };
    }

    try {
      let rootNode: any;
      let fileName = "";

      if (parsed.nodeId) {
        const nodeData = await figmaFetch<any>(
          `/files/${parsed.fileKey}/nodes?ids=${encodeURIComponent(parsed.nodeId)}`,
          data.figmaToken,
        );
        fileName = nodeData.name ?? parsed.fileKey;
        const nodes = nodeData.nodes ?? {};
        const firstKey = Object.keys(nodes)[0];
        rootNode = nodes[firstKey]?.document;
      } else {
        const fileData = await figmaFetch<any>(
          `/files/${parsed.fileKey}?depth=3`,
          data.figmaToken,
        );
        fileName = fileData.name ?? parsed.fileKey;
        rootNode = fileData.document;
      }

      if (!rootNode) {
        return { ok: false as const, error: "No document node found in Figma response" };
      }

      const simplified = simplifyFigmaNode(rootNode);

      if (project.result) {
        try {
          await supabase.from("project_snapshots").insert({
            project_id: project.id,
            user_id: userId,
            label: "Before Figma Compile",
            schema: JSON.parse(project.result),
            source: "system",
          });
        } catch (snapErr) {
          console.warn("[compileFigmaToSchema] Failed to save snapshot:", snapErr);
        }
      }

      try {
        await consumeOrThrow(userId, CREDIT_COSTS.generate_project, "figma.compile_schema", project.id);
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }

      const compilerPrompt = `You are a Figma-to-MobileAppSchema compiler.
Given a simplified Figma node layout tree, translate it into a valid, production-ready MobileAppSchema JSON object.

## Target Schema Specifications
- You must reply with ONLY a single valid JSON object matching MobileAppSchema.
- The schema is a JSON structure:
  {
    "name": "App Name",
    "theme": {
      "mode": "dark|light",
      "palette": { "primary": "#hex", "accent": "#hex", "background": "#hex", "card": "#hex", "text": "#hex", "muted": "#hex", "gradient": ["#hex", "#hex"] },
      "typography": { "headingFont": "font-name", "bodyFont": "font-name" }
    },
    "screens": [
      {
        "id": "screen_id",
        "title": "Screen Title",
        "icon": "icon-name",
        "layout": "bento-grid|stack|magazine|split-hero|full-bleed",
        "transition": "slide|fade|zoom|none",
        "elements": [
          // valid screen element objects
        ]
      }
    ]
  }

## Element Types Catalog
- Core: greeting, text, button, input, image, card, list, divider, spacer, header, section, search-bar, avatar, badge, toggle, slider, tab-bar, carousel, rating, chip-group, notification, price-tag, step-indicator, countdown, grid-cards, hero-banner
- Premium: glass-card, gradient-mesh-bg, parallax-hero, marquee, stat-card-xl, feature-showcase, testimonial, pricing-card, onboarding-slide
- Charts: donut-chart, bar-chart, line-chart, sparkline, progress-bar, progress-ring, radar-chart, gauge-chart
- Forms: dropdown, date-picker, checkbox, radio-group, textarea
- Interactive: map-card, chat-bubble, video-player, timeline, accordion, bottom-sheet
- Differentiators: swipe-card, calendar-strip, bank-card, component-ref
- States: skeleton, empty-state

## Instructions
1. Map Figma frames and groups to logical layout constructs. Look for nested layouts. If a frame has layoutMode=HORIZONTAL, arrange elements side-by-side (using grids or inline wrappers).
2. Map text layers to text, greeting, or button labels. Look at layout modes and padding to identify buttons (rounded background with centered text).
3. Detect image layers (isImage=true) and map them to image, hero-banner, or avatar components.
4. Detect lists of identical frames and compile them into a list or activity-feed.
5. Translate colors and text styles from the nodes into the theme.palette and typography.
6. Provide navigation configurations linking the generated screens.
7. Return ONLY valid JSON. No markdown backticks, no markdown formatting, no explanation. Just raw JSON.`;

      const userPrompt = `Figma Node Layout Tree:\n${JSON.stringify(simplified, null, 2)}\n\nOriginal App Prompt: ${project.prompt}`;

      const { CODE_GEN_SYSTEM_PROMPT, parseAppSchema } = await import("./code-gen");
      const result = await callAI(compilerPrompt, userPrompt);

      if (!result.ok) {
        return { ok: false as const, error: "AI compiler failed: " + result.error };
      }

      const parsedSchema = parseAppSchema(result.text);
      if (!parsedSchema) {
        return { ok: false as const, error: "Malformed JSON returned from AI compiler." };
      }

      const { validateAndFixSchema } = await import("./schema-validator");
      const { schema: fixed } = validateAndFixSchema(parsedSchema);

      const finalJson = JSON.stringify(fixed ?? parsedSchema);

      await supabase
        .from("projects")
        .update({ result: finalJson, status: "ready", error_text: null })
        .eq("id", project.id);

      return { ok: true as const, schema: fixed ?? parsedSchema };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Figma compile failed",
      };
    }
  });

