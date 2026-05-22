import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
