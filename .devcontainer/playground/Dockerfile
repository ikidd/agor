FROM mcr.microsoft.com/devcontainers/typescript-node:20 AS builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@9.15.1

# Set working directory
WORKDIR /build

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/agor-daemon/package.json ./apps/agor-daemon/
COPY apps/agor-ui/package.json ./apps/agor-ui/
COPY apps/agor-cli/package.json ./apps/agor-cli/
COPY packages/core/package.json ./packages/core/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build all packages
RUN pnpm -r build

# Production stage
FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm and AI CLIs
RUN npm install -g pnpm@9.15.1 @anthropic-ai/claude-code @google/gemini-cli @openai/codex

# Copy built artifacts from builder
WORKDIR /app
COPY --from=builder /build .

# Set working directory
WORKDIR /workspaces/agor

# Run as root for simplified sandbox
# Docker access works out of the box in Codespaces
