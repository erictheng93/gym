# HR Service Dockerfile
# Multi-stage build for optimized production image

# ============================================
# Stage 1: Build stage
# ============================================
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Copy the hr-business-logic package (local dependency)
COPY ../backend/packages/hr-business-logic ../backend/packages/hr-business-logic

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# ============================================
# Stage 2: Production stage
# ============================================
FROM node:20-alpine AS runner

# Add non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hrservice

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Copy the hr-business-logic package
COPY --from=builder /backend/packages/hr-business-logic ../backend/packages/hr-business-logic

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Change ownership
RUN chown -R hrservice:nodejs /app

# Switch to non-root user
USER hrservice

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
