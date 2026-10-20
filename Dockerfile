# ==============================================================================
# Multi-Stage Production Dockerfile for Telemedicine Backend System
# ==============================================================================

# Stage 1: Build Stage
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies needed for compiling native modules
RUN apk add --no-cache python3 make g++

COPY package*.json tsconfig.json ./

# Install all dependencies including devDependencies for build
RUN npm ci

COPY src ./src
COPY docs ./docs

# Compile TypeScript to JavaScript in dist/
RUN npm run build

# Prune devDependencies to keep image size small
RUN npm prune --production

# ==============================================================================
# Stage 2: Production Runtime Stage
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Install curl for docker healthcheck
RUN apk add --no-cache curl

# Copy production dependencies and compiled artifacts from builder
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/docs ./docs

# Run as non-root node user for security hardening
USER node

EXPOSE 3000

# Health check probing the liveness probe endpoint
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health/live || exit 1

CMD ["node", "dist/server.js"]
