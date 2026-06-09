# Mobivable agent-build sandbox template.
#
# The default @e2b/code-interpreter image is Python/Jupyter-focused and lacks
# bun + the Expo CLI, so the autonomous Expo build (bun install / bunx tsc /
# bunx expo export) fails on it. This template layers Node 20 + bun + expo + a
# static server on top of the code-interpreter base (kept so the SDK's runtime
# stays happy) and pre-warms a global tool install for faster first builds.
#
# Build & publish (from this directory, with the E2B CLI + Docker + E2B_API_KEY):
#   e2b template build
# Then set on the server that runs the ws_* MCP tools:
#   E2B_TEMPLATE=mobivable-expo   (or the template id printed by the build)

FROM e2bdev/code-interpreter:latest

ENV DEBIAN_FRONTEND=noninteractive

# Node 20 (the base may ship an older Node). curl is available at build time.
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# bun — the package manager + runner the agent uses (bun / bunx).
RUN curl -fsSL https://bun.sh/install | bash \
    && ln -sf /root/.bun/bin/bun /usr/local/bin/bun \
    && ln -sf /root/.bun/bin/bunx /usr/local/bin/bunx
ENV BUN_INSTALL="/root/.bun"
ENV PATH="/root/.bun/bin:${PATH}"

# Global CLIs the build/preview pipeline shells out to. `serve` hosts the
# static Expo-web export for the live preview.
RUN npm install -g @expo/cli serve \
    && npm cache clean --force

# The workspace root the ws_* tools operate in.
RUN mkdir -p /workspace
WORKDIR /workspace

# Sanity check at build time — fail the image build if a tool is missing.
RUN node --version && bun --version && npx --yes expo --version && serve --version
