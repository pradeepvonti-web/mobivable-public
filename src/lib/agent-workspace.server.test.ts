/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";

// The module imports supabaseAdmin at top level; stub it so importing the
// module doesn't try to construct a real client. Tests inject ctx.supabase.
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import {
  resolveWorkspacePath,
  assertCommandAllowed,
  getOrCreateWorkspace,
  wsWriteFile,
  wsReadFile,
  wsEditFile,
  wsRunCommand,
  wsStartCommand,
  wsCommandStatus,
  ensureExpoWebPreview,
  getExpoPreviewUrl,
  probeWorkspaceRuntime,
  resolveBuildStack,
  isWorkspaceRuntimeAvailable,
  EXPO_PREVIEW_PORT,
  setSandboxFactoryForTests,
  WORKDIR,
  type WorkspaceSandbox,
  type SandboxFactory,
} from "./agent-workspace.server";
import { SCAFFOLD_MARKER } from "./expo-scaffold";

// ── Fake E2B sandbox ────────────────────────────────────────────────
function makeFakeSandbox(id = "sbx_test"): WorkspaceSandbox & { _files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    sandboxId: id,
    _files: files,
    files: {
      async write(path: string, data: string) {
        files.set(path, data);
      },
      async writeBytes(path: string, data: Uint8Array) {
        files.set(path, `<bytes:${data.length}>`);
      },
      async read(path: string) {
        if (!files.has(path)) throw new Error(`ENOENT: ${path}`);
        return files.get(path)!;
      },
      async list(path: string) {
        const prefix = path.endsWith("/") ? path : `${path}/`;
        const names = new Set<string>();
        for (const p of files.keys()) {
          if (p.startsWith(prefix)) {
            const rest = p.slice(prefix.length).split("/")[0];
            names.add(rest);
          }
        }
        return [...names].map((name) => ({ name, type: "file" }));
      },
    },
    commands: {
      async run(cmd: string) {
        // Pretend every command (tsc, lint, install, export) succeeds.
        return { stdout: `ran: ${cmd}`, stderr: "", exitCode: 0 };
      },
      async runBackground() {
        /* no-op */
      },
    },
    async setTimeout() {
      /* no-op */
    },
    getHost(port: number) {
      return `${port}-${id}.e2b.test`;
    },
  };
}

// ── Fake Supabase (projects + project_file_overrides) ────────────────
function makeFakeSupabase(
  projectRow: Record<string, unknown>,
  initialOverrides: Array<{ file_path: string; content: string }> = [],
) {
  const overrides: Array<{ project_id?: string; file_path: string; content: string }> = [
    ...initialOverrides,
  ];

  function builder(table: string) {
    // Mirrors Supabase's query builder: every method returns the same
    // chainable object, which is itself awaitable.
    const api: any = {
      _table: table,
      _op: null as string | null,
      select() {
        api._op = "select";
        return api;
      },
      eq() {
        return api;
      },
      in() {
        return api;
      },
      maybeSingle() {
        if (table === "projects") return Promise.resolve({ data: projectRow, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      update(payload: Record<string, unknown>) {
        if (table === "projects") Object.assign(projectRow, payload);
        api._op = "update";
        return api;
      },
      delete() {
        api._op = "delete";
        return api;
      },
      insert(rows: any) {
        const arr = Array.isArray(rows) ? rows : [rows];
        if (table === "project_file_overrides") for (const r of arr) overrides.push(r);
        return api;
      },
      then(resolve: (v: { data?: unknown; error: null }) => void) {
        // A bare select on project_file_overrides resolves the rows (loadMirroredFiles).
        if (table === "project_file_overrides" && api._op === "select") {
          resolve({
            data: overrides.map((o) => ({ file_path: o.file_path, content: o.content })),
            error: null,
          });
        } else {
          resolve({ error: null });
        }
      },
    };
    return api;
  }

  return { from: (t: string) => builder(t), _overrides: overrides };
}

const CTX_USER = "user-1";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

function fakeFactory(sandbox: WorkspaceSandbox): SandboxFactory {
  return {
    async create() {
      return sandbox;
    },
    async connect() {
      return sandbox;
    },
  };
}

beforeEach(() => {
  process.env.E2B_API_KEY = "test-key";
  delete process.env.E2B_TEMPLATE;
  delete process.env.DISABLE_AGENT_WORKSPACE;
  setSandboxFactoryForTests(null);
});

describe("resolveBuildStack (graceful fallback)", () => {
  it("honors an explicit web target regardless of runtime", () => {
    expect(resolveBuildStack({ target_stack: "web" })).toBe("web");
  });
  it("uses expo when requested/default and the runtime is available", () => {
    expect(resolveBuildStack({ target_stack: "expo" })).toBe("expo");
    expect(resolveBuildStack({})).toBe("expo");
    expect(resolveBuildStack(null)).toBe("expo");
  });
  it("falls back to web when E2B is not configured", () => {
    delete process.env.E2B_API_KEY;
    expect(isWorkspaceRuntimeAvailable()).toBe(false);
    expect(resolveBuildStack({ target_stack: "expo" })).toBe("web");
  });
  it("falls back to web when the kill-switch is set", () => {
    process.env.DISABLE_AGENT_WORKSPACE = "1";
    expect(resolveBuildStack({})).toBe("web");
  });
});

describe("resolveWorkspacePath", () => {
  it("resolves a clean relative path under the workspace root", () => {
    expect(resolveWorkspacePath("app/(tabs)/index.tsx")).toBe(`${WORKDIR}/app/(tabs)/index.tsx`);
    expect(resolveWorkspacePath("./store/useAppStore.ts")).toBe(`${WORKDIR}/store/useAppStore.ts`);
  });
  it("rejects absolute paths and traversal escapes", () => {
    expect(() => resolveWorkspacePath("/etc/passwd")).toThrow(/absolute/);
    expect(() => resolveWorkspacePath("../../etc/passwd")).toThrow(/escape/);
    expect(() => resolveWorkspacePath("")).toThrow();
  });
  it("normalizes inner '..' that stays within root", () => {
    expect(resolveWorkspacePath("app/foo/../bar.tsx")).toBe(`${WORKDIR}/app/bar.tsx`);
  });
});

describe("assertCommandAllowed", () => {
  it("allows dev tooling", () => {
    expect(() => assertCommandAllowed("bunx tsc --noEmit")).not.toThrow();
    expect(() => assertCommandAllowed("bun run lint")).not.toThrow();
    expect(() => assertCommandAllowed("ls -la app")).not.toThrow();
  });
  it("rejects unknown binaries and dangerous commands", () => {
    expect(() => assertCommandAllowed("python evil.py")).toThrow(/allowlist/);
    expect(() => assertCommandAllowed("curl http://x")).toThrow(/deny/);
    expect(() => assertCommandAllowed("sudo rm -rf /")).toThrow(/deny/);
    expect(() => assertCommandAllowed("")).toThrow();
  });
});

describe("workspace lifecycle", () => {
  it("scaffolds a fresh Expo workspace and mirrors files to the DB", async () => {
    const sandbox = makeFakeSandbox();
    setSandboxFactoryForTests(fakeFactory(sandbox));
    const supabase = makeFakeSupabase({
      id: PROJECT_ID,
      name: "Budgeteye",
      prompt: "budget app",
      user_id: CTX_USER,
      attachments: {},
    });

    const ws = await getOrCreateWorkspace(PROJECT_ID, { userId: CTX_USER, supabase }, {});
    expect(ws.freshlyScaffolded).toBe(true);
    expect(ws.stack).toBe("expo");
    // Scaffold seeded into the sandbox and mirrored to project_file_overrides.
    expect(sandbox._files.has(`${WORKDIR}/${SCAFFOLD_MARKER}`)).toBe(true);
    expect(sandbox._files.has(`${WORKDIR}/app/(tabs)/_layout.tsx`)).toBe(true);
    expect(supabase._overrides.some((o) => o.file_path === "app/(tabs)/_layout.tsx")).toBe(true);
  });

  it("writes, reads, and surgically edits a file", async () => {
    const sandbox = makeFakeSandbox();
    setSandboxFactoryForTests(fakeFactory(sandbox));
    const supabase = makeFakeSupabase({
      id: PROJECT_ID,
      name: "App",
      prompt: "x",
      user_id: CTX_USER,
      attachments: {},
    });
    const ctx = { userId: CTX_USER, supabase };

    const w = await wsWriteFile(PROJECT_ID, ctx, "store/useAppStore.ts", "export const x = 1;\n");
    expect(w.path).toBe("store/useAppStore.ts");
    const r = await wsReadFile(PROJECT_ID, ctx, "store/useAppStore.ts");
    expect(r.content).toContain("export const x = 1;");

    const e = await wsEditFile(PROJECT_ID, ctx, "store/useAppStore.ts", "x = 1", "x = 42");
    expect(e.replaced).toBe(true);
    const r2 = await wsReadFile(PROJECT_ID, ctx, "store/useAppStore.ts");
    expect(r2.content).toContain("x = 42");
  });

  it("rejects a non-unique edit target", async () => {
    const sandbox = makeFakeSandbox();
    setSandboxFactoryForTests(fakeFactory(sandbox));
    const supabase = makeFakeSupabase({
      id: PROJECT_ID,
      name: "App",
      prompt: "x",
      user_id: CTX_USER,
      attachments: {},
    });
    const ctx = { userId: CTX_USER, supabase };
    await wsWriteFile(PROJECT_ID, ctx, "a.ts", "dup\ndup\n");
    await expect(wsEditFile(PROJECT_ID, ctx, "a.ts", "dup", "x")).rejects.toThrow(/unique/);
  });

  it("refuses a project the caller does not own", async () => {
    const sandbox = makeFakeSandbox();
    setSandboxFactoryForTests(fakeFactory(sandbox));
    const supabase = makeFakeSupabase({
      id: PROJECT_ID,
      name: "App",
      prompt: "x",
      user_id: "someone-else",
      attachments: {},
    });
    await expect(
      getOrCreateWorkspace(PROJECT_ID, { userId: CTX_USER, supabase }, {}),
    ).rejects.toThrow(/not authorized/);
  });

  it("runs an allowlisted command in the workspace", async () => {
    const sandbox = makeFakeSandbox();
    setSandboxFactoryForTests(fakeFactory(sandbox));
    const supabase = makeFakeSupabase({
      id: PROJECT_ID,
      name: "App",
      prompt: "x",
      user_id: CTX_USER,
      attachments: {},
    });
    const res = await wsRunCommand(PROJECT_ID, { userId: CTX_USER, supabase }, "bunx tsc --noEmit");
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("tsc");
  });

  it("builds + serves the Expo web preview and persists the URL", async () => {
    const sandbox = makeFakeSandbox("sbx_prev");
    setSandboxFactoryForTests(fakeFactory(sandbox));
    const supabase = makeFakeSupabase({
      id: PROJECT_ID,
      name: "Budgeteye",
      prompt: "budget app",
      user_id: CTX_USER,
      attachments: {},
    });
    const ctx = { userId: CTX_USER, supabase };

    const res = await ensureExpoWebPreview(PROJECT_ID, ctx);
    expect(res.ok).toBe(true);
    expect(res.status).toBe("building");
    expect(res.jobId).toMatch(/^job-/);
    expect(res.url).toBe(`https://${EXPO_PREVIEW_PORT}-sbx_prev.e2b.test`);

    // URL persisted on the project so the studio can render it once the job finishes.
    const persisted = await getExpoPreviewUrl(PROJECT_ID, ctx);
    expect(persisted).toBe(res.url);
  });

  it("runs a long command in the background and reports running → done", async () => {
    const sandbox = makeFakeSandbox("sbx_job");
    setSandboxFactoryForTests(fakeFactory(sandbox));
    const supabase = makeFakeSupabase({
      id: PROJECT_ID,
      name: "App",
      prompt: "x",
      user_id: CTX_USER,
      attachments: {},
    });
    const ctx = { userId: CTX_USER, supabase };

    const started = await wsStartCommand(PROJECT_ID, ctx, "bun install");
    expect(started.status).toBe("running");
    expect(started.jobId).toMatch(/^job-/);

    // No exit marker yet → still running.
    const s1 = await wsCommandStatus(PROJECT_ID, ctx, started.jobId);
    expect(s1.status).toBe("running");

    // Simulate the background job finishing (the wrapper writes .log + .exit).
    sandbox._files.set(`${WORKDIR}/.jobs/${started.jobId}.log`, "installed 42 packages");
    sandbox._files.set(`${WORKDIR}/.jobs/${started.jobId}.exit`, "0\n");

    const s2 = await wsCommandStatus(PROJECT_ID, ctx, started.jobId);
    expect(s2.status).toBe("done");
    expect(s2.exitCode).toBe(0);
    expect(s2.stdout).toContain("installed");
  });

  it("rejects a malformed job id", async () => {
    const sandbox = makeFakeSandbox();
    setSandboxFactoryForTests(fakeFactory(sandbox));
    const supabase = makeFakeSupabase({
      id: PROJECT_ID,
      name: "App",
      prompt: "x",
      user_id: CTX_USER,
      attachments: {},
    });
    await expect(
      wsCommandStatus(PROJECT_ID, { userId: CTX_USER, supabase }, "../etc/passwd"),
    ).rejects.toThrow(/invalid job id/);
  });

  it("restores prior files into a fresh sandbox when the old one is gone", async () => {
    const sandbox = makeFakeSandbox("sbx_new");
    // Old sandbox was recycled: connect throws, but a new one can be created.
    setSandboxFactoryForTests({
      async create() {
        return sandbox;
      },
      async connect() {
        throw new Error("sandbox not found");
      },
    });
    const projectRow = {
      id: PROJECT_ID,
      name: "App",
      prompt: "x",
      user_id: CTX_USER,
      // Has a (now-dead) sandbox id + matching scaffold version → reconnect is tried first.
      attachments: {
        agent_workspace: { sandboxId: "sbx_dead", stack: "expo", scaffoldVersion: "1" },
      },
    };
    const supabase = makeFakeSupabase(projectRow, [
      { file_path: "app/(tabs)/_layout.tsx", content: "// AGENT EDITED LAYOUT" },
      { file_path: "store/useAppStore.ts", content: "export const x = 1;\n" },
    ]);

    const ws = await getOrCreateWorkspace(PROJECT_ID, { userId: CTX_USER, supabase }, {});
    // Restored from the mirror — NOT re-scaffolded (which would clobber edits).
    expect(ws.freshlyScaffolded).toBe(false);
    expect(sandbox._files.get(`${WORKDIR}/app/(tabs)/_layout.tsx`)).toBe("// AGENT EDITED LAYOUT");
    expect(sandbox._files.get(`${WORKDIR}/store/useAppStore.ts`)).toContain("export const x = 1;");
  });

  it("probeWorkspaceRuntime reports all steps OK on a working runtime", async () => {
    const sandbox = makeFakeSandbox("sbx_probe");
    setSandboxFactoryForTests(fakeFactory(sandbox));
    process.env.E2B_TEMPLATE = "mobivable-expo";
    const res = await probeWorkspaceRuntime();
    expect(res.ok).toBe(true);
    expect(res.apiKey).toBe(true);
    expect(res.template).toBe("mobivable-expo");
    expect(res.sandboxId).toBe("sbx_probe");
    expect(res.steps.map((s) => s.name)).toEqual(
      expect.arrayContaining([
        "create",
        "files.write",
        "files.read",
        "commands.run",
        "bun present",
        "getHost",
      ]),
    );
    expect(res.steps.every((s) => s.ok)).toBe(true);
  });

  it("probeWorkspaceRuntime fails fast when E2B_API_KEY is missing", async () => {
    delete process.env.E2B_API_KEY;
    const res = await probeWorkspaceRuntime();
    expect(res.ok).toBe(false);
    expect(res.apiKey).toBe(false);
    expect(res.error).toMatch(/E2B_API_KEY/);
  });

  it("creates the sandbox from E2B_TEMPLATE when configured", async () => {
    const sandbox = makeFakeSandbox();
    let createOpts: { template?: string } | null = null;
    setSandboxFactoryForTests({
      async create(opts) {
        createOpts = opts;
        return sandbox;
      },
      async connect() {
        return sandbox;
      },
    });
    process.env.E2B_TEMPLATE = "mobivable-expo";
    const supabase = makeFakeSupabase({
      id: PROJECT_ID,
      name: "A",
      prompt: "x",
      user_id: CTX_USER,
      attachments: {},
    });
    await getOrCreateWorkspace(PROJECT_ID, { userId: CTX_USER, supabase }, {});
    expect(createOpts!.template).toBe("mobivable-expo");
  });
});
