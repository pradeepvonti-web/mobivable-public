/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";

// mcp-tools (via agent-workspace.server) imports supabaseAdmin at module load.
// Stub it with a chainable query builder so importing works and invoke_skill's
// "user skill lookup" resolves to no row (forcing the built-in fallback path).
const noRowChain: any = {
  select: () => noRowChain,
  eq: () => noRowChain,
  maybeSingle: async () => ({ data: null, error: null }),
};
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => noRowChain },
}));

import { MCP_TOOLS, getMcpTool, type McpTool } from "./mcp-tools";

const SNAKE = /^[a-z][a-z0-9_]*$/;

/** The build-engine tools added for the autonomous Expo flow. */
const BUILD_TOOLS = [
  "ws_write_file",
  "ws_read_file",
  "ws_edit_file",
  "ws_list_files",
  "ws_run_command",
  "ws_run_command_async",
  "ws_command_status",
  "ws_start_preview",
  "invoke_skill",
  "read_mockup",
  "ws_diagnose",
];

describe("MCP_TOOLS manifest integrity", () => {
  it("is non-empty", () => {
    expect(MCP_TOOLS.length).toBeGreaterThan(0);
  });

  it("has unique, snake_case names", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name, `${name} should be snake_case`).toMatch(SNAKE);
    }
  });

  it("every tool is well-formed", () => {
    for (const t of MCP_TOOLS) {
      expect(t.description.length, `${t.name} needs a description`).toBeGreaterThan(0);
      expect(t.inputSchema.type, `${t.name} schema must be object`).toBe("object");
      expect(typeof t.inputSchema.properties, `${t.name} needs properties`).toBe("object");
      expect(typeof t.run, `${t.name}.run must be a function`).toBe("function");
    }
  });

  it("declares no required field that isn't in properties", () => {
    for (const t of MCP_TOOLS) {
      const props = new Set(Object.keys(t.inputSchema.properties));
      for (const req of t.inputSchema.required ?? []) {
        expect(props.has(req), `${t.name}: required '${req}' missing from properties`).toBe(true);
      }
    }
  });
});

describe("getMcpTool dispatch", () => {
  it("resolves every manifest tool by name", () => {
    for (const t of MCP_TOOLS) {
      expect(getMcpTool(t.name)).toBe(t);
    }
  });

  it("returns undefined for an unknown tool", () => {
    expect(getMcpTool("does_not_exist")).toBeUndefined();
    expect(getMcpTool("")).toBeUndefined();
  });
});

describe("autonomous build tools are wired", () => {
  it("registers all the ws_* / skill / mockup tools", () => {
    const names = new Set(MCP_TOOLS.map((t) => t.name));
    for (const name of BUILD_TOOLS) {
      expect(names.has(name), `missing build tool ${name}`).toBe(true);
    }
  });

  it("requires project_id on every workspace tool", () => {
    const wsTools = MCP_TOOLS.filter((t) => t.name.startsWith("ws_") && t.name !== "ws_diagnose");
    expect(wsTools.length).toBeGreaterThan(0);
    for (const t of wsTools) {
      expect(t.inputSchema.required ?? [], `${t.name} must require project_id`).toContain(
        "project_id",
      );
    }
  });

  it("ws_diagnose takes no input", () => {
    const t = getMcpTool("ws_diagnose")!;
    expect(Object.keys(t.inputSchema.properties)).toHaveLength(0);
    expect(t.inputSchema.required ?? []).toHaveLength(0);
  });
});

describe("invoke_skill run", () => {
  const ctx = { userId: "u1", patHash: "deadbeef" };

  it("falls back to the built-in frontend-design skill", async () => {
    const tool = getMcpTool("invoke_skill") as McpTool;
    const res = (await tool.run({ name: "frontend-design" }, ctx)) as {
      name: string;
      source: string;
      body: string;
    };
    expect(res.source).toBe("builtin");
    expect(res.name).toBe("frontend-design");
    expect(res.body).toContain("StyleSheet");
  });

  it("resolves case-insensitively / trims whitespace", async () => {
    const tool = getMcpTool("invoke_skill") as McpTool;
    const res = (await tool.run({ name: "  Frontend-Design  " }, ctx)) as { source: string };
    expect(res.source).toBe("builtin");
  });

  it("throws a helpful error for an unknown skill", async () => {
    const tool = getMcpTool("invoke_skill") as McpTool;
    await expect(tool.run({ name: "no-such-skill" }, ctx)).rejects.toThrow(/Unknown skill/);
  });

  it("throws when no name is given", async () => {
    const tool = getMcpTool("invoke_skill") as McpTool;
    await expect(tool.run({}, ctx)).rejects.toThrow(/required/);
  });
});
