# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install dependencies (use --legacy-peer-deps for compatibility)
RUN npm install --legacy-peer-deps

# Copy all source code
COPY . .

# Build the production bundle
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy built output, adapter, and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/cloud-run-entry.mjs ./cloud-run-entry.mjs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Google Cloud Run requires the container to listen on $PORT
EXPOSE 8080

# Start the production server via our Cloud Run adapter
CMD ["node", "cloud-run-entry.mjs"]
