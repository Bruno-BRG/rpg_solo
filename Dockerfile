# ─────────────────────────────────────────────────────────────
# RPG Solo — multi-stage Dockerfile.
#
# Produces a slim standalone Next.js server image. Migrations are
# applied on container start (`npm start` runs prisma migrate deploy).
#
# Base image is node:*-slim (Debian/glibc) on purpose: Prisma's schema
# engine mis-detects the libssl variant on Alpine/musl and crashes with
# "Could not parse schema engine response".
# ─────────────────────────────────────────────────────────────

# ── Stage 1: dependencies ────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# prisma/ must exist here: the `postinstall` script runs `prisma generate`,
# which needs schema.prisma.
COPY prisma ./prisma
RUN npm ci

# ── Stage 2: build ───────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL is required by Prisma at build time but never contacted
# (no engine connection during `prisma generate` / `next build`).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
# Regenerate the client against the final schema copied above.
RUN npx prisma generate
RUN npm run build

# ── Stage 3: runtime ─────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Prisma client + schema + migrations, needed for `prisma migrate deploy`.
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=node:node /app/node_modules/prisma ./node_modules/prisma
# The standalone node_modules ships no .bin links; without them `npm start`
# cannot resolve `prisma` or `next` (sh: prisma: not found).
COPY --from=builder --chown=node:node /app/node_modules/.bin ./node_modules/.bin

USER node
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
