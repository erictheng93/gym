# Gym Nexus Backend - Production Dockerfile
# Based on Directus 11 with custom extensions

# ==============================================================================
# Stage 1: Build extensions
# ==============================================================================
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /build

# Copy extension source files
COPY extensions/ ./extensions/

# Build gym-endpoints extension
WORKDIR /build/extensions/directus-extension-gym-endpoints
RUN pnpm install --frozen-lockfile || pnpm install
RUN mkdir -p dist && cp -r src/* dist/

# Build gym-hooks extension
WORKDIR /build/extensions/directus-extension-gym-hooks
RUN pnpm install --frozen-lockfile || pnpm install
RUN mkdir -p dist && cp -r src/* dist/

# ==============================================================================
# Stage 2: Production image
# ==============================================================================
FROM directus/directus:11

# Copy built extensions with dependencies
COPY --from=builder /build/extensions/directus-extension-gym-endpoints /directus/extensions/directus-extension-gym-endpoints
COPY --from=builder /build/extensions/directus-extension-gym-hooks /directus/extensions/directus-extension-gym-hooks

# Set environment defaults for production
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    CACHE_ENABLED=true \
    CACHE_AUTO_PURGE=true \
    RATE_LIMITER_ENABLED=true \
    RATE_LIMITER_POINTS=100 \
    RATE_LIMITER_DURATION=60

# Health check configuration
# Checks the /gym/health endpoint every 30 seconds
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8055/gym/health || exit 1

# Expose Directus default port
EXPOSE 8055

# Default command (inherited from base image)
# CMD ["node", "cli.js", "start"]
