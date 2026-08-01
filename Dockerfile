# syntax=docker/dockerfile:1

# ---- deps: install node_modules only (cached separately from source) ----
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: `next build` with output: 'standalone' ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* are inlined into the client bundle at build time, not read
# at container runtime — they MUST come in as build args. Changing any of
# them requires rebuilding the image, not just restarting the container.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_TELEMETRY_DISABLED=1

# lib/session.ts throws at module load if SESSION_JWT_SECRET is unset, and
# several API routes (swap/accept, admin/audit-logs, admin/access-logs,
# admin/shifts/batch, admin/shifts/owners, lib/auditLog.ts, lib/accessLog.ts)
# call createClient(url, SUPABASE_SERVICE_ROLE_KEY) at MODULE scope — `next
# build`'s page-data-collection pass imports every route module, so both
# throw during the build if unset. Neither placeholder is ever used to sign
# or authenticate anything real — the actual values are injected at
# container runtime via docker-compose `environment:` and override these.
ENV SESSION_JWT_SECRET=build-time-placeholder-unused-at-runtime \
    SUPABASE_SERVICE_ROLE_KEY=build-time-placeholder-unused-at-runtime

RUN npm run build

# ---- runner: minimal image, standalone server only ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
