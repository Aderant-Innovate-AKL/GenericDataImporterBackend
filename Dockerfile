# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

ARG GHCR_READ_TOKEN
ENV GHCR_READ_TOKEN=${GHCR_READ_TOKEN}

# Copy package files
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile && pnpm store prune

# Stage 2: Builder
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
# Copy all application files
COPY . .

# Build the NestJS application
RUN pnpm build

# Stage 3: Runner
FROM node:20-alpine AS runner

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy package files and install production dependencies only
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Set correct permissions
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose the port the app runs on
EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# Start the NestJS application
CMD ["node", "dist/src/main"]
