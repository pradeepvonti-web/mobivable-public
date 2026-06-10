# Mobivable agent-build sandbox template.
#
# The default @e2b/code-interpreter image is Python/Jupyter-focused and lacks
# bun, so the autonomous Expo build (bun install / bunx tsc / bunx expo export)
# fails on it. This template layers Node 20 + bun + `serve` on top of the
# code-interpreter base (kept so the SDK's runtime stays happy). Expo is NOT
# global — it's installed per-project via `bun install` and run with `bunx expo`.
#
# Build & publish (v2 — from this directory, with Docker + the e2b SDK):
#   npx tsx build.prod.ts
# Then set on the server that runs the ws_* MCP tools:
#   E2B_TEMPLATE=mobivable-expo

FROM e2bdev/code-interpreter:latest

ENV DEBIAN_FRONTEND=noninteractive

# Node 20 (the base may ship an older Node). curl is available at build time.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# bun — the package manager + runner the agent uses (bun / bunx).
# Install via npm (Node 20 is already present) rather than the curl|bash
# installer: npm drops the binary in the global bin (/usr/local/bin), which is
# world-accessible and on PATH for the non-root runtime `user`. The curl
# installer instead targets ~/.bun (root's home) — unreadable by `user`, so bun
# came back "command not found" (exit 127) at runtime even though the build-time
# check (run as root) passed. (The global `serve` install below proves this path
# is reachable by `user`.)
RUN npm install -g bun \
    && npm cache clean --force

# `serve` hosts the static Expo-web export for the live preview. Expo itself is
# NOT installed globally on purpose: the agent builds with the PROJECT-LOCAL
# expo (the scaffold pins expo ~51 via package.json) through `bunx expo`, so a
# global expo would go unused and risk SDK-version skew.
RUN npm install -g serve \
    && npm cache clean --force

# The workspace root the ws_* tools operate in.
RUN mkdir -p /workspace
WORKDIR /workspace

# Sanity check at build time — fail the image build if a tool is missing.
# (expo is project-local via `bunx expo`, so it's not checked here.)
RUN node --version && bun --version && serve --version
