# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:20 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps --ignore-scripts

COPY . .

ENV VITE_SUPABASE_PROJECT_ID="nfdcvbnzbbkkdpxaelmp"
ENV VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mZGN2Ym56YmJra2RweGFlbG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTM4MTMsImV4cCI6MjA5NDQ2OTgxM30.5xbxxAE1mzQXUnweF5ySIUOVCndDRzb2L5ow25xkh_M"
ENV VITE_SUPABASE_URL="https://nfdcvbnzbbkkdpxaelmp.supabase.co"
ENV SUPABASE_PROJECT_ID="nfdcvbnzbbkkdpxaelmp"
ENV SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mZGN2Ym56YmJra2RweGFlbG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTM4MTMsImV4cCI6MjA5NDQ2OTgxM30.5xbxxAE1mzQXUnweF5ySIUOVCndDRzb2L5ow25xkh_M"
ENV SUPABASE_URL="https://nfdcvbnzbbkkdpxaelmp.supabase.co"

RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV VITE_SUPABASE_PROJECT_ID="nfdcvbnzbbkkdpxaelmp"
ENV VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mZGN2Ym56YmJra2RweGFlbG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTM4MTMsImV4cCI6MjA5NDQ2OTgxM30.5xbxxAE1mzQXUnweF5ySIUOVCndDRzb2L5ow25xkh_M"
ENV VITE_SUPABASE_URL="https://nfdcvbnzbbkkdpxaelmp.supabase.co"
ENV SUPABASE_PROJECT_ID="nfdcvbnzbbkkdpxaelmp"
ENV SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mZGN2Ym56YmJra2RweGFlbG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTM4MTMsImV4cCI6MjA5NDQ2OTgxM30.5xbxxAE1mzQXUnweF5ySIUOVCndDRzb2L5ow25xkh_M"
ENV SUPABASE_URL="https://nfdcvbnzbbkkdpxaelmp.supabase.co"

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/cloud-run-entry.mjs ./cloud-run-entry.mjs
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 8080
CMD ["node", "cloud-run-entry.mjs"]
