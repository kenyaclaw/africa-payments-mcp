# ============================================
# STAGE 1: Build
# ============================================
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm ci --ignore-scripts && \
    npm cache clean --force

# Copy source code
COPY . .

# Build
RUN npm run build

# ============================================
# STAGE 2: Production
# ============================================
FROM node:20-alpine AS production

# Set metadata
LABEL maintainer="KenyaClaw Team <team@kenyaclaw.com>"
LABEL description="Africa Payments MCP Server"
LABEL org.opencontainers.image.source="https://github.com/kenyaclaw/africa-payments-mcp"

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/build ./build
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

# Create config directory
RUN mkdir -p /app/config && \
    chown -R nodejs:nodejs /app/config

# Switch to non-root user
USER nodejs

# Expose port (for webhook server if enabled)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Default command
ENTRYPOINT ["node", "build/index.js", "--config", "/app/config/config.json"]
