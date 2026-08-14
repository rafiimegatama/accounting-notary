# Multi-stage build for the Next.js app. Paired with docker-compose.yml,
# which also runs PostgreSQL — nothing needs to be installed on the host
# beyond Docker itself (see CLAUDE.md deployment notes).
#
# node:20-alpine is pinned by digest in all 4 stages below (image@sha256:...,
# tag kept alongside for readability) — see docker-compose.yml's top comment
# for why, and the exact `docker pull` + `docker inspect` steps to refresh
# the pin deliberately. All 4 occurrences must be updated together.

FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS deps
WORKDIR /app
# package-lock.json copied alongside package.json (previously missing) so
# `npm ci` can actually enforce it — `npm install` without the lockfile
# present resolves dependency versions fresh on every build, silently
# drifting from what's committed instead of being reproducible.
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Lean, prod-only node_modules — separate from `builder` above, which needs
# devDependencies (typescript/tailwindcss/vitest/eslint/prisma CLI) to
# actually build. Without this stage the final image shipped the full
# dev+prod tree. `npm ci --omit=dev` alone would be missing the generated
# Prisma client code, though: that's written into node_modules/.prisma by
# `prisma generate` (run above in `builder`, against the devDependency
# `prisma` CLI, deliberately not installed here) — copied in explicitly
# from `builder` below instead of re-running `prisma generate` against a
# stage that has no `prisma` package to run it with.
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["npm", "start"]
