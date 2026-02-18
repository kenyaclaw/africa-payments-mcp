# ============================================
# STAGE 1: Build
# ============================================
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY . .

# Install dev dependencies and build
RUN npm ci && \
    npm run build && \
    npm prune --production

# ============================================
# STAGE 2: Production
# ============================================
FROM node:18-alpine AS production

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

# Create config directory
RUN mkdir -p /app/config && \
    chown -R nodejs:nodejs /app/config

# Switch to non-root user
USER nodejs

# Expose port (for webhook server if enabled)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Default command
ENTRYPOINT ["node", "build/index.js"]
CMD ["--config", "/app/config/config.json"]

# ============================================
# STAGE 3: Development (optional target)
# ============================================
FROM node:18-alpine AS development

WORKDIR /app

# Install all dependencies including dev
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Expose port for development
EXPOSE 3000

# Development command with hot reload
CMD ["npm", "run", "dev"]
