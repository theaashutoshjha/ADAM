# ==============================================================================
# ADAM-AR / AuditEQ — Multi-Stage Production Dockerfile
# Base: Node 22-alpine with ffmpeg for audio DSP / voice processing
# ==============================================================================

# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Run type check and production bundle build
RUN npm run lint
RUN npm run build

# Stage 2: Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

# Install FFmpeg and system dependencies for audio preprocessing
RUN apk add --no-cache ffmpeg curl

ENV NODE_ENV=production
ENV PORT=3000

# Copy package files and install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built assets from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/config ./config
COPY --from=builder /app/public ./public

# Create runtime directories for SQLite and uploads
RUN mkdir -p /app/.data /app/.data/uploads /app/.data/databases && \
    chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "dist/server.cjs"]
