# ── base ──────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# ── deps (dev+prod para build) ────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

# ── build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm add -D @types/express dotenv
RUN pnpm build

# ── prod deps solo ────────────────────────────────────────────────────────────
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod

# ── imagen final ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main"]
