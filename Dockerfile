# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:22 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

COPY . .

ENV VITE_SUPABASE_PROJECT_ID="dsfzczkdyhslkxmfovaj"
ENV VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzZnpjemtkeWhzbGt4bWZvdmFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDgyMjQsImV4cCI6MjA5NzgyNDIyNH0.ts3LzApkH68v5OyCQpqQdoHE0R_lUTz6jrmzq8Gwfx8"
ENV VITE_SUPABASE_URL="https://dsfzczkdyhslkxmfovaj.supabase.co"
ENV SUPABASE_PROJECT_ID="dsfzczkdyhslkxmfovaj"
ENV SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzZnpjemtkeWhzbGt4bWZvdmFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDgyMjQsImV4cCI6MjA5NzgyNDIyNH0.ts3LzApkH68v5OyCQpqQdoHE0R_lUTz6jrmzq8Gwfx8"
ENV SUPABASE_URL="https://dsfzczkdyhslkxmfovaj.supabase.co"

RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV VITE_SUPABASE_PROJECT_ID="dsfzczkdyhslkxmfovaj"
ENV VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzZnpjemtkeWhzbGt4bWZvdmFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDgyMjQsImV4cCI6MjA5NzgyNDIyNH0.ts3LzApkH68v5OyCQpqQdoHE0R_lUTz6jrmzq8Gwfx8"
ENV VITE_SUPABASE_URL="https://dsfzczkdyhslkxmfovaj.supabase.co"
ENV SUPABASE_PROJECT_ID="dsfzczkdyhslkxmfovaj"
ENV SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzZnpjemtkeWhzbGt4bWZvdmFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNDgyMjQsImV4cCI6MjA5NzgyNDIyNH0.ts3LzApkH68v5OyCQpqQdoHE0R_lUTz6jrmzq8Gwfx8"
ENV SUPABASE_URL="https://dsfzczkdyhslkxmfovaj.supabase.co"

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/cloud-run-entry.mjs ./cloud-run-entry.mjs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 8080
CMD ["node", "cloud-run-entry.mjs"]
