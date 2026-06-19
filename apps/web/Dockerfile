# ── base ──────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

# ── build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* se bake en build — deben pasarse como build args
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MOCK_MODE=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MOCK_MODE=$NEXT_PUBLIC_MOCK_MODE
RUN pnpm add mysql2 mssql
RUN pnpm build

# ── imagen final (standalone) ─────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
