# HR Service Dockerfile
# Multi-stage build. Build context is the REPO ROOT (it needs the local
# @gym-nexus/hr-business-logic package from backend/packages):
#   docker build -f hr-service/docker/Dockerfile .
# Files sent to the build are allow-listed in Dockerfile.dockerignore.

# ============================================
# Stage 1: Build the shared hr-business-logic package
# ============================================
FROM oven/bun:1.4.3-alpine AS hr-logic

WORKDIR /src/backend/packages/hr-business-logic

COPY backend/packages/hr-business-logic/package.json backend/packages/hr-business-logic/bun.lock ./
RUN bun install --frozen-lockfile

COPY backend/packages/hr-business-logic/ ./
RUN bun run build && rm -rf node_modules

# ============================================
# Stage 2: Build hr-service
# ============================================
FROM oven/bun:1.4.3-alpine AS builder

WORKDIR /src/hr-service

COPY --from=hr-logic /src/backend/packages/hr-business-logic /src/backend/packages/hr-business-logic
COPY hr-service/package.json hr-service/bun.lock ./
RUN bun install --frozen-lockfile

COPY hr-service/ ./
RUN bun run build

# ============================================
# Stage 3: Production dependencies only
# ============================================
FROM oven/bun:1.4.3-alpine AS prod-deps

WORKDIR /src/hr-service

COPY --from=hr-logic /src/backend/packages/hr-business-logic /src/backend/packages/hr-business-logic
COPY hr-service/package.json hr-service/bun.lock ./
RUN bun install --frozen-lockfile --production \
  # bun links file: deps back to /src/...; dereference so the runtime image is self-contained
  && cp -rL node_modules/@gym-nexus/hr-business-logic /tmp/hr-business-logic \
  && rm -rf node_modules/@gym-nexus/hr-business-logic \
  && mv /tmp/hr-business-logic node_modules/@gym-nexus/hr-business-logic

# ============================================
# Stage 4: Runtime
# ============================================
FROM node:20-alpine AS runner

# Add non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hrservice

WORKDIR /app

COPY --from=prod-deps --chown=hrservice:nodejs /src/hr-service/node_modules ./node_modules
COPY --from=builder --chown=hrservice:nodejs /src/hr-service/dist ./dist
COPY --chown=hrservice:nodejs hr-service/migrations ./migrations
COPY --chown=hrservice:nodejs hr-service/package.json ./

# Switch to non-root user
USER hrservice

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
