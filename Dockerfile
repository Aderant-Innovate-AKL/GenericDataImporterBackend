# Stage 1: Builder
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

ARG GHCR_READ_TOKEN
ENV GHCR_READ_TOKEN=${GHCR_READ_TOKEN}

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy all source files
COPY . .

# Build the app
RUN pnpm build


# Stage 2: Runner
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

COPY --from=builder /app/dist ./dist

USER node

EXPOSE 3001
CMD ["node", "dist/src/main"]
