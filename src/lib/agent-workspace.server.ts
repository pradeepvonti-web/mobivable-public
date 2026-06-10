/**
 * Per-project agent workspace — a PERSISTENT E2B sandbox holding the real
 * source tree the Studio agent builds (Expo app by default).
 *
 * This is the runtime the autonomous build flow needs: the ADK agent (the
 * brain) calls the `ws_*` MCP tools, and each of those executes here against a
 * live sandbox where files are written and `bun`/`tsc`/`eslint`/`expo` run for
 * real. Unlike the legacy `e2b-sandbox.functions.ts` (ephemeral, runCode-only),
 * this keeps ONE sandbox alive per project (id persisted on the project row)
 * and uses the filesystem + command APIs.
 *
 * Durability: every write/edit is mirrored into `project_file_overrides` so the
 * generated source survives sandbox GC and shows up in the existing Code viewer
 * and export, even if the sandbox is later recycled.
 *
 * Requires E2B_API_KEY. The sandbox surface is abstracted behind
 * `WorkspaceSandbox` + an injectable factory so the logic is unit-testable
 * without touching E2B (see `setSandboxFactoryForTests`).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { expoScaffold, EXPO_SCAFFOLD_VERSION } from "./expo-scaffold";
// Type-only import (erased at build — no SDK pulled into the bundle). Lets the
// compiler verify `wrapE2bSandbox` against the real E2B API surface.
import type { Sandbox as E2BSandbox } from "@e2b/code-interpreter";

// ─── Constants ──────────────────────────────────────────────────────
/** Root of the project tree inside the sandbox. */
export const WORKDIR = "/workspace";
/** Keep-alive window for the sandbox between agent turns (ms). */
const SANDBOX_TIMEOUT_MS = 15 * 60 * 1000; // 15 min
/** Per-command wall-clock cap. */
const DEFAULT_CMD_TIMEOUT_MS = 120_000;
/** Max bytes of command output we return to the agent (keeps tokens sane). */
const MAX_OUTPUT_CHARS = 24_000;

export type TargetStack = "expo" | "web";

/** Leading binaries an agent command may invoke. Anything else is rejected. */
const COMMAND_ALLOWLIST = new Set([
  "bun",
  "bunx",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "node",
  "tsc",
  "eslint",
  "prettier",
  "expo",
  "eas",
  "ls",
  "cat",
  "find",
  "grep",
  "rg",
  "head",
  "tail",
  "wc",
  "echo",
  "pwd",
  "mkdir",
  "rm",
  "mv",
  "cp",
  "touch",
  "true",
  "test",
]);
/** Substrings that get a command rejected outright, allowlist or not. */
const COMMAND_DENY = [
  /\bsudo\b/,
  /\bcurl\b/,
  /\bwget\b/,
  /\bssh\b/,
  /\bscp\b/,
  /\bnc\b/,
  /\bchmod\s+\+s\b/,
  /\b:\(\)\s*\{/ /* fork bomb */,
];

// ─── Sandbox abstraction (for testability) ──────────────────────────

export interface WorkspaceSandbox {
  readonly sandboxId: string;
  files: {
    write(path: string, data: string): Promise<unknown>;
    /** Write raw bytes (e.g. an embedded mockup image). */
    writeBytes(path: string, data: Uint8Array): Promise<unknown>;
    read(path: string): Promise<string>;
    list(path: string): Promise<Array<{ name: string; type?: string; path?: string }>>;
  };
  commands: {
    run(
      cmd: string,
      opts?: { cwd?: string; timeoutMs?: number },
    ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
    /** Start a long-running process (dev/static server) without awaiting exit. */
    runBackground(cmd: string, opts?: { cwd?: string }): Promise<void>;
  };
  setTimeout(ms: number): Promise<void>;
  /** Public host for a port exposed inside the sandbox (e.g. "8088-id.e2b.app"). */
  getHost(port: number): string;
}

export interface SandboxFactory {
  create(opts: { apiKey: string; timeoutMs: number; template?: string }): Promise<WorkspaceSandbox>;
  connect(id: string, opts: { apiKey: string }): Promise<WorkspaceSandbox>;
}

let _factory: SandboxFactory | null = null;

/** Test seam — inject a fake sandbox factory. Pass `null` to restore E2B. */
export function setSandboxFactoryForTests(factory: SandboxFactory | null): void {
  _factory = factory;
}

/** Adapt the raw E2B sandbox to our WorkspaceSandbox surface. */
function wrapE2bSandbox(sbx: E2BSandbox): WorkspaceSandbox {
  return {
    sandboxId: sbx.sandboxId,
    files: {
      write: (p: string, d: string) => sbx.files.write(p, d),
      // e2b accepts string | ArrayBuffer | Blob | ReadableStream. Pass the
      // underlying ArrayBuffer (our byte arrays always back a full, exact buffer).
      writeBytes: (p: string, d: Uint8Array) =>
        sbx.files.write(
          p,
          d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) as ArrayBuffer,
        ),
      read: (p: string) => sbx.files.read(p),
      list: (p: string) => sbx.files.list(p),
    },
    commands: {
      run: (cmd: string, opts?: { cwd?: string; timeoutMs?: number }) =>
        sbx.commands.run(cmd, opts),
      runBackground: async (cmd: string, opts?: { cwd?: string }) => {
        // background:true returns a handle immediately; we don't await exit.
        await sbx.commands.run(cmd, { ...opts, background: true });
      },
    },
    setTimeout: (ms: number) => sbx.setTimeout(ms),
    getHost: (port: number) => sbx.getHost(port),
  };
}

/** Default factory: the real E2B code-interpreter SDK. */
function e2bFactory(): SandboxFactory {
  return {
    async create({ apiKey, timeoutMs, template }) {
      const { Sandbox } = await import("@e2b/code-interpreter");
      // Use the custom Mobivable template (node + bun + expo) when configured;
      // otherwise the default image (which lacks bun/expo — builds will fail).
      const sbx = template
        ? await Sandbox.create(template, { apiKey, timeoutMs })
        : await Sandbox.create({ apiKey, timeoutMs });
      return wrapE2bSandbox(sbx);
    },
    async connect(id, { apiKey }) {
      const { Sandbox } = await import("@e2b/code-interpreter");
      const sbx = await Sandbox.connect(id, { apiKey });
      return wrapE2bSandbox(sbx);
    },
  };
}

function factory(): SandboxFactory {
  return _factory ?? e2bFactory();
}

/** True when the E2B-backed workspace runtime is usable (and not kill-switched). */
export function isWorkspaceRuntimeAvailable(): boolean {
  if (process.env.DISABLE_AGENT_WORKSPACE === "1") return false;
  // A test-injected factory means we're in a unit test → treat as available.
  if (_factory) return true;
  return Boolean(process.env.E2B_API_KEY);
}

/**
 * Decide the build stack for a project, applying graceful fallback. An Expo
 * build needs the workspace runtime; if it's unavailable (no E2B key, or the
 * DISABLE_AGENT_WORKSPACE kill-switch), fall back to "web" (the schema pipeline)
 * so builds still succeed instead of flailing on dead ws_* tools.
 */
export function resolveBuildStack(
  attachments: Record<string, unknown> | null | undefined,
): TargetStack {
  const requested =
    attachments && typeof attachments === "object" && !Array.isArray(attachments)
      ? (attachments as Record<string, unknown>).target_stack
      : undefined;
  if (requested === "web") return "web";
  // Expo requested (or default) — only if the runtime can actually run it.
  return isWorkspaceRuntimeAvailable() ? "expo" : "web";
}

// ─── Context + project access ───────────────────────────────────────

export interface WorkspaceCtx {
  userId: string;
  /** Optional user-scoped client; falls back to supabaseAdmin. */
  supabase?: { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface WorkspaceMeta {
  sandboxId: string;
  stack: TargetStack;
  scaffoldVersion: string;
  updatedAt: string;
  /** Set once `bun install` has run in this sandbox. */
  depsInstalled?: boolean;
  /** Set once the static Expo-web server is running in this sandbox. */
  previewStarted?: boolean;
  /** Public URL of the running Expo-web preview, if any. */
  previewUrl?: string;
}

interface ProjectRow {
  id: string;
  name: string | null;
  prompt: string | null;
  attachments: Record<string, unknown> | null;
}

function db(ctx: WorkspaceCtx) {
  return (ctx.supabase ?? supabaseAdmin) as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

/** Load a project the caller owns. Throws if missing or not owned. */
async function loadOwnedProject(projectId: string, ctx: WorkspaceCtx): Promise<ProjectRow> {
  const { data, error } = await db(ctx)
    .from("projects")
    .select("id, name, prompt, attachments, user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(`project lookup failed: ${error.message}`);
  if (!data) throw new Error(`project ${projectId} not found`);
  if (data.user_id && ctx.userId && data.user_id !== ctx.userId) {
    throw new Error("not authorized for this project");
  }
  return {
    id: data.id,
    name: data.name ?? null,
    prompt: data.prompt ?? null,
    attachments:
      data.attachments && typeof data.attachments === "object" && !Array.isArray(data.attachments)
        ? (data.attachments as Record<string, unknown>)
        : {},
  };
}

function readMeta(project: ProjectRow): WorkspaceMeta | null {
  const m = project.attachments?.agent_workspace;
  if (m && typeof m === "object") {
    const o = m as Record<string, unknown>;
    if (typeof o.sandboxId === "string") {
      return {
        sandboxId: o.sandboxId,
        stack: o.stack === "web" ? "web" : "expo",
        scaffoldVersion: typeof o.scaffoldVersion === "string" ? o.scaffoldVersion : "0",
        updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
        depsInstalled: o.depsInstalled === true,
        previewStarted: o.previewStarted === true,
        previewUrl: typeof o.previewUrl === "string" ? o.previewUrl : undefined,
      };
    }
  }
  return null;
}

async function saveMeta(
  projectId: string,
  ctx: WorkspaceCtx,
  prev: Record<string, unknown>,
  meta: WorkspaceMeta,
): Promise<void> {
  const { error } = await db(ctx)
    .from("projects")
    .update({ attachments: { ...prev, agent_workspace: meta } })
    .eq("id", projectId);
  if (error) throw new Error(`failed to persist workspace meta: ${error.message}`);
}

/** Read the project fresh, merge `patch` into agent_workspace, and persist. */
async function mergeWorkspaceMeta(
  projectId: string,
  ctx: WorkspaceCtx,
  patch: Partial<WorkspaceMeta>,
): Promise<void> {
  const project = await loadOwnedProject(projectId, ctx);
  const existing = (project.attachments?.agent_workspace as Record<string, unknown>) ?? {};
  await db(ctx)
    .from("projects")
    .update({
      attachments: {
        ...project.attachments,
        agent_workspace: { ...existing, ...patch, updatedAt: new Date().toISOString() },
      },
    })
    .eq("id", projectId);
}

// ─── Path safety ────────────────────────────────────────────────────

/** Resolve a caller-supplied relative path to an absolute path under WORKDIR. */
export function resolveWorkspacePath(rel: string): string {
  const cleaned = String(rel ?? "")
    .trim()
    .replace(/^\.\//, "");
  if (!cleaned) throw new Error("path is required");
  if (cleaned.startsWith("/")) throw new Error("absolute paths are not allowed");
  // Normalize and forbid escaping the workspace root.
  const parts: string[] = [];
  for (const seg of cleaned.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) throw new Error("path escapes the workspace root");
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  if (parts.length === 0) throw new Error("invalid path");
  return `${WORKDIR}/${parts.join("/")}`;
}

/** Relative (workspace-root) form of an absolute workspace path, for DB mirroring. */
function toRel(absPath: string): string {
  return absPath.startsWith(`${WORKDIR}/`)
    ? absPath.slice(WORKDIR.length + 1)
    : absPath.replace(/^\//, "");
}

// ─── File mirroring → project_file_overrides ────────────────────────

async function mirrorFile(
  projectId: string,
  ctx: WorkspaceCtx,
  relPath: string,
  content: string,
): Promise<void> {
  // Upsert by (project_id, file_path). Delete-then-insert keeps it simple and
  // avoids depending on a unique constraint that may not exist.
  const client = db(ctx);
  await client
    .from("project_file_overrides")
    .delete()
    .eq("project_id", projectId)
    .eq("file_path", relPath);
  await client.from("project_file_overrides").insert({
    project_id: projectId,
    user_id: ctx.userId,
    file_path: relPath,
    content,
  });
}

async function mirrorMany(
  projectId: string,
  ctx: WorkspaceCtx,
  files: Record<string, string>,
): Promise<void> {
  const client = db(ctx);
  const paths = Object.keys(files);
  if (paths.length === 0) return;
  // Clear any prior rows for these paths, then bulk insert.
  await client
    .from("project_file_overrides")
    .delete()
    .eq("project_id", projectId)
    .in("file_path", paths);
  await client.from("project_file_overrides").insert(
    paths.map((p) => ({
      project_id: projectId,
      user_id: ctx.userId,
      file_path: p,
      content: files[p],
    })),
  );
}

/** Decode an image URL (data: or https:) to raw bytes for embedding. */
async function fetchImageBytes(rawUrl: string): Promise<Uint8Array | null> {
  const m = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(rawUrl);
  if (m) {
    const bin = atob(m[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  if (/^https?:\/\//i.test(rawUrl)) {
    try {
      const res = await fetch(rawUrl);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  return null;
}

/** All mirrored source files for a project, as { relPath: content }. */
async function loadMirroredFiles(
  projectId: string,
  ctx: WorkspaceCtx,
): Promise<Record<string, string>> {
  const { data } = (await db(ctx)
    .from("project_file_overrides")
    .select("file_path, content")
    .eq("project_id", projectId)) as {
    data: Array<{ file_path: string; content: string }> | null;
  };
  const out: Record<string, string> = {};
  for (const r of data ?? []) out[r.file_path] = r.content;
  return out;
}

// ─── Workspace lifecycle ────────────────────────────────────────────

export interface Workspace {
  sandbox: WorkspaceSandbox;
  project: ProjectRow;
  stack: TargetStack;
  /** True when this call created/scaffolded a fresh sandbox. */
  freshlyScaffolded: boolean;
}

/**
 * Get the project's live sandbox, creating + scaffolding one if needed.
 * Reconnects to the persisted sandbox id when possible.
 */
export async function getOrCreateWorkspace(
  projectId: string,
  ctx: WorkspaceCtx,
  opts: { stack?: TargetStack } = {},
): Promise<Workspace> {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) throw new Error("E2B_API_KEY is not configured — the agent workspace cannot run.");

  const project = await loadOwnedProject(projectId, ctx);
  const meta = readMeta(project);
  const stack: TargetStack = opts.stack ?? meta?.stack ?? "expo";
  const f = factory();

  // 1. Try to reconnect to an existing sandbox.
  if (meta?.sandboxId) {
    try {
      const sandbox = await f.connect(meta.sandboxId, { apiKey });
      await sandbox.setTimeout(SANDBOX_TIMEOUT_MS);
      if (stack === "expo") await ensureWorkdirOwned(sandbox);
      // Already scaffolded at the current version → reuse as-is.
      if (meta.scaffoldVersion === EXPO_SCAFFOLD_VERSION || stack === "web") {
        return { sandbox, project, stack, freshlyScaffolded: false };
      }
      // Stale/absent scaffold on an otherwise-live sandbox → (re)apply.
      const fresh = await scaffoldInto(sandbox, projectId, ctx, project, stack);
      await saveMeta(projectId, ctx, project.attachments ?? {}, {
        sandboxId: sandbox.sandboxId,
        stack,
        scaffoldVersion: EXPO_SCAFFOLD_VERSION,
        updatedAt: new Date().toISOString(),
      });
      return { sandbox, project, stack, freshlyScaffolded: fresh };
    } catch {
      // Connect failed (sandbox GC'd / expired) — fall through to create.
    }
  }

  // 2. Create a brand-new sandbox.
  // NOTE: this also runs when a prior sandbox was recycled/expired. In that
  // case the project already has mirrored files (scaffold + the agent's prior
  // edits) — restore the FULL tree instead of re-scaffolding, so multi-session
  // work survives. A truly new project has no overrides → scaffold fresh.
  const sandbox = await f.create({
    apiKey,
    timeoutMs: SANDBOX_TIMEOUT_MS,
    template: process.env.E2B_TEMPLATE || undefined,
  });
  if (stack === "expo") await ensureWorkdirOwned(sandbox);
  const prior = stack === "expo" ? await loadMirroredFiles(projectId, ctx) : {};
  let freshlyScaffolded: boolean;
  if (Object.keys(prior).length > 0) {
    for (const [rel, content] of Object.entries(prior)) {
      await sandbox.files.write(`${WORKDIR}/${rel}`, content);
    }
    await embedMockupInto(sandbox, project).catch(() => undefined);
    freshlyScaffolded = false; // restored, not scaffolded
  } else {
    await scaffoldInto(sandbox, projectId, ctx, project, stack);
    freshlyScaffolded = true;
  }
  // Fresh sandbox ⇒ deps not installed and no preview server yet, so omit
  // depsInstalled/previewStarted/previewUrl (they reset to falsy/undefined).
  await saveMeta(projectId, ctx, project.attachments ?? {}, {
    sandboxId: sandbox.sandboxId,
    stack,
    scaffoldVersion: EXPO_SCAFFOLD_VERSION,
    updatedAt: new Date().toISOString(),
  });
  return { sandbox, project, stack, freshlyScaffolded };
}

/**
 * Make the workspace root writable by the non-root sandbox `user`. The template
 * creates /workspace as root (Dockerfile `mkdir`), but E2B runs `commands.run`
 * as `user`, so without this `bun install` fails with EACCES creating
 * node_modules. Idempotent + best-effort; `user` has passwordless sudo in the
 * E2B base image. Belt-and-suspenders alongside the Dockerfile chown so it works
 * even against sandboxes from an older template build.
 */
async function ensureWorkdirOwned(sandbox: WorkspaceSandbox): Promise<void> {
  await sandbox.commands
    .run(`sudo mkdir -p ${WORKDIR} && sudo chown -R "$(id -un):$(id -gn)" ${WORKDIR}`, {
      timeoutMs: 20_000,
    })
    .catch(() => undefined);
}

/** Seed the scaffold into a sandbox + mirror it to the DB. Returns true. */
async function scaffoldInto(
  sandbox: WorkspaceSandbox,
  projectId: string,
  ctx: WorkspaceCtx,
  project: ProjectRow,
  stack: TargetStack,
): Promise<boolean> {
  if (stack !== "expo") return false; // web stack uses the legacy schema path
  await ensureWorkdirOwned(sandbox);
  const files = expoScaffold(project.name || project.prompt || "Mobivable App");
  for (const [rel, content] of Object.entries(files)) {
    await sandbox.files.write(`${WORKDIR}/${rel}`, content);
  }
  await mirrorMany(projectId, ctx, files);
  // Drop the approved mockup into the workspace so the agent can literally see it.
  await embedMockupInto(sandbox, project).catch(() => undefined);
  return true;
}

/** Path of the embedded mockup image inside the workspace. */
export const MOCKUP_PATH = "designs/mockup.png";

/** Write the project's approved mockup image into the sandbox as designs/mockup.png. */
async function embedMockupInto(sandbox: WorkspaceSandbox, project: ProjectRow): Promise<boolean> {
  const rawUrl = project.attachments?.design_mockup_url;
  if (typeof rawUrl !== "string" || !rawUrl) return false;
  const bytes = await fetchImageBytes(rawUrl);
  if (!bytes) return false;
  await sandbox.files.writeBytes(`${WORKDIR}/${MOCKUP_PATH}`, bytes);
  return true;
}

/**
 * Public entry: ensure the approved mockup image exists in the project's
 * workspace at designs/mockup.png. Best-effort — returns whether it was written.
 */
export async function embedMockupPng(
  projectId: string,
  ctx: WorkspaceCtx,
): Promise<{ embedded: boolean; path: string }> {
  const { sandbox, project } = await getOrCreateWorkspace(projectId, ctx, { stack: "expo" });
  const embedded = await embedMockupInto(sandbox, project).catch(() => false);
  return { embedded, path: MOCKUP_PATH };
}

// ─── Public file/command operations (used by the ws_* MCP tools) ────

export async function wsWriteFile(
  projectId: string,
  ctx: WorkspaceCtx,
  path: string,
  content: string,
): Promise<{ path: string; bytes: number }> {
  const { sandbox } = await getOrCreateWorkspace(projectId, ctx);
  const abs = resolveWorkspacePath(path);
  await sandbox.files.write(abs, content);
  await mirrorFile(projectId, ctx, toRel(abs), content);
  return { path: toRel(abs), bytes: content.length };
}

export async function wsReadFile(
  projectId: string,
  ctx: WorkspaceCtx,
  path: string,
): Promise<{ path: string; content: string }> {
  const { sandbox } = await getOrCreateWorkspace(projectId, ctx);
  const abs = resolveWorkspacePath(path);
  const content = await sandbox.files.read(abs);
  return { path: toRel(abs), content };
}

export async function wsEditFile(
  projectId: string,
  ctx: WorkspaceCtx,
  path: string,
  oldString: string,
  newString: string,
): Promise<{ path: string; replaced: boolean }> {
  if (oldString === newString) throw new Error("oldString and newString are identical");
  const { sandbox } = await getOrCreateWorkspace(projectId, ctx);
  const abs = resolveWorkspacePath(path);
  const current = await sandbox.files.read(abs);
  const idx = current.indexOf(oldString);
  if (idx === -1) throw new Error("oldString not found in file");
  if (current.indexOf(oldString, idx + oldString.length) !== -1) {
    throw new Error("oldString is not unique in file — include more surrounding context");
  }
  const next = current.slice(0, idx) + newString + current.slice(idx + oldString.length);
  await sandbox.files.write(abs, next);
  await mirrorFile(projectId, ctx, toRel(abs), next);
  return { path: toRel(abs), replaced: true };
}

export async function wsListFiles(
  projectId: string,
  ctx: WorkspaceCtx,
  path = ".",
): Promise<{ path: string; entries: Array<{ name: string; type: string }> }> {
  const { sandbox } = await getOrCreateWorkspace(projectId, ctx);
  const abs = path === "." || path === "" ? WORKDIR : resolveWorkspacePath(path);
  const raw = await sandbox.files.list(abs);
  const entries = raw.map((e) => ({ name: e.name, type: e.type === "dir" ? "dir" : "file" }));
  return { path: toRel(abs) || ".", entries };
}

function clampOutput(s: string): string {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  return s.slice(0, MAX_OUTPUT_CHARS) + `\n…[truncated ${s.length - MAX_OUTPUT_CHARS} chars]`;
}

/** Validate a command against the allow/deny lists. Throws on rejection. */
export function assertCommandAllowed(cmd: string): void {
  const trimmed = String(cmd ?? "").trim();
  if (!trimmed) throw new Error("command is required");
  for (const deny of COMMAND_DENY) {
    if (deny.test(trimmed)) throw new Error(`command rejected (matched deny rule): ${deny}`);
  }
  // Leading token of the first sub-command (handles `cmd && other`, `a | b`).
  const lead = trimmed.split(/[\s;|&]+/).find(Boolean) ?? "";
  const bin = lead.split("/").pop() ?? lead;
  if (!COMMAND_ALLOWLIST.has(bin)) {
    throw new Error(
      `command "${bin}" is not in the allowlist (${[...COMMAND_ALLOWLIST].join(", ")})`,
    );
  }
}

export async function wsRunCommand(
  projectId: string,
  ctx: WorkspaceCtx,
  cmd: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ command: string; exitCode: number; stdout: string; stderr: string }> {
  assertCommandAllowed(cmd);
  const { sandbox } = await getOrCreateWorkspace(projectId, ctx);
  const res = await sandbox.commands.run(cmd, {
    cwd: WORKDIR,
    timeoutMs: Math.min(Math.max(opts.timeoutMs ?? DEFAULT_CMD_TIMEOUT_MS, 1000), 300_000),
  });
  return {
    command: cmd,
    exitCode: res.exitCode,
    stdout: clampOutput(res.stdout ?? ""),
    stderr: clampOutput(res.stderr ?? ""),
  };
}

// ─── Background commands (for long ops: bun install, expo export) ───
// Synchronous wsRunCommand is fine for quick checks (tsc, lint), but
// `bun install` / `expo export` take minutes — longer than the ADK→MCP bridge
// timeout and serverless request limits. These run such commands detached,
// writing output + an exit-code marker to files in the sandbox, so a later
// (separate request) status poll can read the result without holding a request open.

const JOBS_DIR = `${WORKDIR}/.jobs`;

/** Shell-quote-safe-ish job id (uuid → only [a-z0-9-]). */
function newJobId(): string {
  return `job-${crypto.randomUUID()}`;
}

export async function wsStartCommand(
  projectId: string,
  ctx: WorkspaceCtx,
  cmd: string,
): Promise<{ jobId: string; status: "running" }> {
  assertCommandAllowed(cmd);
  const { sandbox } = await getOrCreateWorkspace(projectId, ctx);
  const jobId = newJobId();
  // Wrap the (already allowlisted) command: capture output + exit code to files.
  // The wrapper itself is ours, not agent input, so it may use shell operators.
  const script =
    `mkdir -p ${JOBS_DIR} && { ${cmd} ; } > ${JOBS_DIR}/${jobId}.log 2>&1 ; ` +
    `echo $? > ${JOBS_DIR}/${jobId}.exit`;
  await sandbox.commands.runBackground(script, { cwd: WORKDIR });
  return { jobId, status: "running" };
}

export async function wsCommandStatus(
  projectId: string,
  ctx: WorkspaceCtx,
  jobId: string,
): Promise<{ jobId: string; status: "running" | "done"; exitCode?: number; stdout: string }> {
  if (!/^job-[A-Za-z0-9-]+$/.test(jobId)) throw new Error("invalid job id");
  const { sandbox } = await getOrCreateWorkspace(projectId, ctx);
  let log = "";
  try {
    log = await sandbox.files.read(`${JOBS_DIR}/${jobId}.log`);
  } catch {
    /* log not created yet */
  }
  let exitRaw: string | null = null;
  try {
    exitRaw = await sandbox.files.read(`${JOBS_DIR}/${jobId}.exit`);
  } catch {
    exitRaw = null; // still running (no exit marker yet)
  }
  if (exitRaw == null) {
    return { jobId, status: "running", stdout: clampOutput(log) };
  }
  const exitCode = parseInt(exitRaw.trim(), 10);
  return {
    jobId,
    status: "done",
    exitCode: Number.isFinite(exitCode) ? exitCode : -1,
    stdout: clampOutput(log),
  };
}

// ─── Live Expo-web preview ──────────────────────────────────────────
/** Port the static Expo-web build is served on inside the sandbox. */
export const EXPO_PREVIEW_PORT = 8088;

export interface ExpoPreviewResult {
  ok: boolean;
  /** Public URL serving the running Expo-web app (iframe this once ready). */
  url?: string;
  /** True when this call kicked off a (re)build. */
  rebuilt: boolean;
  /** Background job id — poll ws_command_status until status="done". */
  jobId?: string;
  /** "building" once the job is launched. */
  status?: string;
  error?: string;
}

/**
 * Kick off the Expo-web build + static server as a BACKGROUND job and return
 * immediately with the (eventual) public URL + a job id. The heavy steps
 * (`bun install`, `expo export`) take minutes — far longer than a single
 * request can stay open — so the caller polls `wsCommandStatus(jobId)` until
 * done, then iframes the URL. This is what makes the preview go "Live".
 *
 * `serve -s` (SPA fallback for expo-router) is launched only the first time;
 * on `rebuild` we just re-export, and the already-running server picks up the
 * new `dist/`.
 */
export async function ensureExpoWebPreview(
  projectId: string,
  ctx: WorkspaceCtx,
  opts: { rebuild?: boolean } = {},
): Promise<ExpoPreviewResult> {
  const { sandbox, stack } = await getOrCreateWorkspace(projectId, ctx, { stack: "expo" });
  if (stack !== "expo") {
    return {
      ok: false,
      rebuilt: false,
      error: "Live preview is only available for the Expo stack.",
    };
  }

  // Guard: the Expo build needs `bun`, which only exists in the custom
  // `mobivable-expo` E2B template. If the environment is missing E2B_TEMPLATE the
  // sandbox boots E2B's default image (no bun/expo) and the build dies silently
  // with a "closed port" — surface the real cause instead. Cheap one-shot check.
  const bunCheck = await sandbox.commands
    .run("bun --version", { cwd: WORKDIR, timeoutMs: 15_000 })
    .catch(() => null);
  if (!bunCheck || bunCheck.exitCode !== 0) {
    return {
      ok: false,
      rebuilt: false,
      error:
        "Expo build runtime is missing `bun` — the sandbox booted the default E2B image. Set E2B_TEMPLATE=mobivable-expo in this environment (Cloudflare Worker / Cloud Run secret) and rebuild.",
    };
  }

  const url = `https://${sandbox.getHost(EXPO_PREVIEW_PORT)}`;
  const jobId = newJobId();

  // Idempotently (re)launch the static server after a successful export: start
  // `serve` only when nothing is already listening on the port. This makes the
  // preview self-healing — a Restart relaunches the server if an earlier build
  // failed before it ever came up, instead of being permanently wedged by an
  // optimistic previewStarted flag. The port check uses `bun -e` (bun is in the
  // template) so it needs no extra tooling. EADDRINUSE is avoided by the guard.
  const ensureServe =
    `( bun -e "fetch('http://localhost:${EXPO_PREVIEW_PORT}').then(()=>process.exit(0)).catch(()=>process.exit(1))" >/dev/null 2>&1 ` +
    `|| (nohup bunx serve dist -s -l ${EXPO_PREVIEW_PORT} > ${JOBS_DIR}/serve.log 2>&1 &) )`;

  // The `serve` step only runs if install + export both succeed (&&-chained), so
  // a failed build leaves a non-zero code in <jobId>.exit for the caller to
  // surface — rather than silently returning a dead port.
  const script =
    `mkdir -p ${JOBS_DIR} && ` +
    `{ bun install && bunx expo export -p web && ${ensureServe} ; } ` +
    `> ${JOBS_DIR}/${jobId}.log 2>&1 ; echo $? > ${JOBS_DIR}/${jobId}.exit`;
  await sandbox.commands.runBackground(script, { cwd: WORKDIR });

  await mergeWorkspaceMeta(projectId, ctx, {
    depsInstalled: true,
    previewStarted: true,
    previewUrl: url,
  });
  return { ok: true, url, rebuilt: true, jobId, status: "building" };
}

/** Read the persisted Expo-web preview URL for a project, if one exists. */
export async function getExpoPreviewUrl(
  projectId: string,
  ctx: WorkspaceCtx,
): Promise<string | null> {
  const project = await loadOwnedProject(projectId, ctx);
  return readMeta(project)?.previewUrl ?? null;
}

// ─── Runtime probe (gap #3: does E2B work on this host?) ────────────

export interface WorkspaceProbeResult {
  /** True only if every step passed. */
  ok: boolean;
  apiKey: boolean;
  template: string | null;
  sandboxId?: string;
  host?: string;
  steps: { name: string; ok: boolean; detail?: string }[];
  error?: string;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Exercise the real E2B runtime path on whatever host this server runs on
 * (e.g. a Cloudflare Worker): create a sandbox, write+read a file, run a
 * command, check bun is present, and resolve a host URL. Returns a per-step
 * report so a deploy-time call confirms the SDK works here and pinpoints any
 * failing step. Creates a short-lived (60s) throwaway sandbox — no project needed.
 */
export async function probeWorkspaceRuntime(): Promise<WorkspaceProbeResult> {
  const steps: WorkspaceProbeResult["steps"] = [];
  const apiKey = process.env.E2B_API_KEY;
  const template = process.env.E2B_TEMPLATE || null;
  if (!apiKey) {
    return { ok: false, apiKey: false, template, steps, error: "E2B_API_KEY is not set." };
  }

  let sandbox: WorkspaceSandbox;
  try {
    sandbox = await factory().create({
      apiKey,
      timeoutMs: 60_000,
      template: template ?? undefined,
    });
    steps.push({ name: "create", ok: true, detail: sandbox.sandboxId });
  } catch (e) {
    return {
      ok: false,
      apiKey: true,
      template,
      steps: [{ name: "create", ok: false, detail: errMsg(e) }],
      error: errMsg(e),
    };
  }

  const probePath = `${WORKDIR}/.probe.txt`;
  try {
    await ensureWorkdirOwned(sandbox);
    await sandbox.files.write(probePath, "mobivable-probe");
    steps.push({ name: "files.write", ok: true });
  } catch (e) {
    steps.push({ name: "files.write", ok: false, detail: errMsg(e) });
  }
  try {
    const c = await sandbox.files.read(probePath);
    steps.push({ name: "files.read", ok: c === "mobivable-probe", detail: c.slice(0, 40) });
  } catch (e) {
    steps.push({ name: "files.read", ok: false, detail: errMsg(e) });
  }
  try {
    const r = await sandbox.commands.run("echo hi", { cwd: WORKDIR, timeoutMs: 20_000 });
    steps.push({
      name: "commands.run",
      ok: r.exitCode === 0 && r.stdout.includes("hi"),
      detail: `exit ${r.exitCode}: ${(r.stdout || r.stderr).trim().slice(0, 60)}`,
    });
  } catch (e) {
    steps.push({ name: "commands.run", ok: false, detail: errMsg(e) });
  }
  // Confirms gap #1 too: the template must actually carry bun.
  try {
    const r = await sandbox.commands.run("bun --version", { cwd: WORKDIR, timeoutMs: 20_000 });
    steps.push({
      name: "bun present",
      ok: r.exitCode === 0,
      detail: (r.stdout || r.stderr).trim().slice(0, 60),
    });
  } catch (e) {
    steps.push({ name: "bun present", ok: false, detail: errMsg(e) });
  }
  let host: string | undefined;
  try {
    host = sandbox.getHost(EXPO_PREVIEW_PORT);
    steps.push({ name: "getHost", ok: !!host, detail: host });
  } catch (e) {
    steps.push({ name: "getHost", ok: false, detail: errMsg(e) });
  }

  return {
    ok: steps.every((s) => s.ok),
    apiKey: true,
    template,
    sandboxId: sandbox.sandboxId,
    host,
    steps,
  };
}
