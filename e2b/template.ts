/**
 * E2B v2 template definition for the Mobivable agent-build sandbox.
 *
 * Replaces the deprecated v1 flow (`e2b.toml` + `e2b template build`). The image
 * spec still lives in `e2b.Dockerfile` as the single source of truth — this just
 * parses it via the v2 SDK builder. Built & published by `build.prod.ts`.
 *
 * The resulting template carries Node 20 + bun + Expo CLI + `serve`, which the
 * autonomous Expo build (src/lib/agent-workspace.server.ts) needs; the default
 * code-interpreter image has none of those.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Template } from "e2b";

const here = dirname(fileURLToPath(import.meta.url));
const dockerfile = readFileSync(join(here, "e2b.Dockerfile"), "utf8");

export const template = Template().fromDockerfile(dockerfile);
