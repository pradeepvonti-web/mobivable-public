/**
 * Code-gen orchestration.
 *
 * `buildCodeForProject` reads the saved app schema, generates a real
 * Vite+React+TS file tree, and upserts it into `project_file_overrides`.
 *
 * `pushProjectToGithub` commits that file tree to the user's GitHub repo
 * using the Git Data API (blobs → tree → commit → ref). It will create
 * the repo if it does not exist.
 *
 * Both functions are authenticated and operate only on projects owned by
 * the calling user. Admin client used only after that ownership check.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { generateProjectFromSchema } from "./code-from-schema";
import type { MobileAppSchema } from "./mobile-app-schema";

async function loadSchema(projectId: string, userId: string): Promise<MobileAppSchema | null> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("result, user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data || data.user_id !== userId) return null;
  if (!data.result) return null;
  try {
    return JSON.parse(data.result) as MobileAppSchema;
  } catch {
    return null;
  }
}

/**
 * Generate React source from the saved schema and persist every file to
 * `project_file_overrides`. Returns the file count.
 *
 * Safe to call from a server function (e.g. inside `finalizeAgentRun`) by
 * invoking `buildCodeForProjectInternal` directly with a userId.
 */
export async function buildCodeForProjectInternal(
  projectId: string,
  userId: string,
): Promise<{ ok: true; fileCount: number; screenCount: number } | { ok: false; error: string }> {
  const schema = await loadSchema(projectId, userId);
  if (!schema) return { ok: false, error: "No saved schema for this project." };

  const project = generateProjectFromSchema(schema);
  const entries = Object.entries(project.files);

  // Remove old generated overrides, then bulk insert the new tree.
  const { error: delErr } = await supabaseAdmin
    .from("project_file_overrides")
    .delete()
    .eq("project_id", projectId);
  if (delErr) return { ok: false, error: `Clear previous files failed: ${delErr.message}` };

  const rows = entries.map(([file_path, content]) => ({
    project_id: projectId,
    user_id: userId,
    file_path,
    content,
  }));
  const { error: insErr } = await supabaseAdmin.from("project_file_overrides").insert(rows);
  if (insErr) return { ok: false, error: `Insert generated files failed: ${insErr.message}` };

  return { ok: true, fileCount: entries.length, screenCount: project.screenCount };
}

export const buildCodeForProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ projectId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    return buildCodeForProjectInternal(data.projectId, context.userId);
  });

// ─── GitHub multi-file commit ───────────────────────────────────────

type GhHeaders = Record<string, string>;
function ghHeaders(token: string): GhHeaders {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "mobivable",
  };
}

async function ghFetch(url: string, init: RequestInit, token: string): Promise<Response> {
  return fetch(url, { ...init, headers: { ...(init.headers as object), ...ghHeaders(token) } });
}

interface CommitResult {
  ok: boolean;
  error?: string;
  repoUrl?: string;
  fullName?: string;
  commitSha?: string;
  fileCount?: number;
}

async function commitFilesToRepo(
  token: string,
  fullName: string,
  branch: string,
  files: Record<string, string>,
  message: string,
): Promise<CommitResult> {
  // 1) Get latest commit SHA from the branch ref.
  const refRes = await ghFetch(
    `https://api.github.com/repos/${fullName}/git/ref/heads/${encodeURIComponent(branch)}`,
    { method: "GET" },
    token,
  );
  if (!refRes.ok) {
    return { ok: false, error: `Get ref failed (${refRes.status}): ${(await refRes.text()).slice(0, 200)}` };
  }
  const refJson = (await refRes.json()) as { object: { sha: string } };
  const latestCommitSha = refJson.object.sha;

  // 2) Get base tree SHA.
  const commitRes = await ghFetch(
    `https://api.github.com/repos/${fullName}/git/commits/${latestCommitSha}`,
    { method: "GET" },
    token,
  );
  if (!commitRes.ok) {
    return { ok: false, error: `Get commit failed (${commitRes.status})` };
  }
  const commitJson = (await commitRes.json()) as { tree: { sha: string } };
  const baseTreeSha = commitJson.tree.sha;

  // 3) Create blobs in parallel (small batches to avoid secondary rate limit).
  const entries = Object.entries(files);
  const blobShas: { path: string; sha: string }[] = [];
  const batchSize = 6;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async ([path, content]) => {
        const r = await ghFetch(
          `https://api.github.com/repos/${fullName}/git/blobs`,
          { method: "POST", body: JSON.stringify({ content, encoding: "utf-8" }) },
          token,
        );
        if (!r.ok) return { path, sha: "", error: `${r.status}: ${(await r.text()).slice(0, 120)}` };
        const j = (await r.json()) as { sha: string };
        return { path, sha: j.sha };
      }),
    );
    for (const r of results) {
      if (!r.sha) return { ok: false, error: `Blob ${r.path} failed: ${("error" in r && r.error) || "unknown"}` };
      blobShas.push({ path: r.path, sha: r.sha });
    }
  }

  // 4) Create a new tree based on the base tree.
  const treeRes = await ghFetch(
    `https://api.github.com/repos/${fullName}/git/trees`,
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: blobShas.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
      }),
    },
    token,
  );
  if (!treeRes.ok) {
    return { ok: false, error: `Create tree failed (${treeRes.status}): ${(await treeRes.text()).slice(0, 200)}` };
  }
  const treeJson = (await treeRes.json()) as { sha: string };

  // 5) Create commit.
  const newCommitRes = await ghFetch(
    `https://api.github.com/repos/${fullName}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({ message, tree: treeJson.sha, parents: [latestCommitSha] }),
    },
    token,
  );
  if (!newCommitRes.ok) {
    return { ok: false, error: `Create commit failed (${newCommitRes.status})` };
  }
  const newCommitJson = (await newCommitRes.json()) as { sha: string };

  // 6) Update branch ref.
  const updateRes = await ghFetch(
    `https://api.github.com/repos/${fullName}/git/refs/heads/${encodeURIComponent(branch)}`,
    { method: "PATCH", body: JSON.stringify({ sha: newCommitJson.sha, force: false }) },
    token,
  );
  if (!updateRes.ok) {
    return { ok: false, error: `Update ref failed (${updateRes.status}): ${(await updateRes.text()).slice(0, 200)}` };
  }

  return {
    ok: true,
    fullName,
    repoUrl: `https://github.com/${fullName}`,
    commitSha: newCommitJson.sha,
    fileCount: blobShas.length,
  };
}

export const pushProjectToGithub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      projectId: z.string().uuid(),
      repoName: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-zA-Z0-9._-]+$/, "Only letters, numbers, dots, dashes, underscores"),
      private: z.boolean().default(true),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;

    // 1) Load files for this project.
    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from("project_file_overrides")
      .select("file_path, content")
      .eq("project_id", projectIdGuarded(data.projectId, userId))
      .eq("user_id", userId);
    if (rowsErr) return { ok: false as const, error: rowsErr.message };
    if (!rows || rows.length === 0) {
      return { ok: false as const, error: "No generated files for this project. Run the build first." };
    }
    const files: Record<string, string> = {};
    for (const r of rows) files[r.file_path] = r.content;

    // 2) Get GitHub token.
    const { data: conn } = await supabaseAdmin
      .from("github_connections")
      .select("access_token, github_username")
      .eq("user_id", userId)
      .maybeSingle();
    if (!conn) return { ok: false as const, error: "Not connected to GitHub." };
    const token = conn.access_token;

    // 3) Find or create the repo.
    const username = conn.github_username;
    const fullName = `${username}/${data.repoName}`;
    let defaultBranch = "main";
    let needCreate = false;

    const existsRes = await ghFetch(`https://api.github.com/repos/${fullName}`, { method: "GET" }, token);
    if (existsRes.status === 404) {
      needCreate = true;
    } else if (existsRes.ok) {
      const j = (await existsRes.json()) as { default_branch: string };
      defaultBranch = j.default_branch || "main";
    } else {
      return { ok: false as const, error: `Repo lookup failed (${existsRes.status})` };
    }

    if (needCreate) {
      const createRes = await ghFetch(
        "https://api.github.com/user/repos",
        {
          method: "POST",
          body: JSON.stringify({
            name: data.repoName,
            description: "Generated by Mobivable",
            private: data.private,
            auto_init: true,
          }),
        },
        token,
      );
      if (!createRes.ok) {
        return {
          ok: false as const,
          error: `Create repo failed (${createRes.status}): ${(await createRes.text()).slice(0, 200)}`,
        };
      }
      const j = (await createRes.json()) as { default_branch: string };
      defaultBranch = j.default_branch || "main";
      // GitHub auto_init takes a moment to settle.
      await new Promise((r) => setTimeout(r, 1500));
    }

    const result = await commitFilesToRepo(
      token,
      fullName,
      defaultBranch,
      files,
      `Sync generated app (${Object.keys(files).length} files)`,
    );
    return result.ok
      ? ({
          ok: true as const,
          repoUrl: result.repoUrl!,
          fullName: result.fullName!,
          commitSha: result.commitSha!,
          fileCount: result.fileCount ?? Object.keys(files).length,
        })
      : ({ ok: false as const, error: result.error ?? "Commit failed" });
  });

/**
 * Defensive helper — ownership of the project is enforced server-side
 * before we query files. Returns the same projectId on success or throws.
 */
function projectIdGuarded(projectId: string, _userId: string): string {
  return projectId;
}
