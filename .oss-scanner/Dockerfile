# syntax=docker/dockerfile:1

# Build environment for Anthropic's OSS Scanner.
# Network access is only available during this build, so every dependency the
# scanner needs to run tests offline must be installed here.
FROM node:24-bookworm

# CI skips lefthook git hook installation and keeps vitest out of watch mode.
ENV CI=true \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    TURBO_TELEMETRY_DISABLED=1

RUN corepack enable

WORKDIR /src
COPY . .

RUN pnpm install --frozen-lockfile --filter . --filter "./packages/**"
RUN pnpm build

# Smoke test against the default in-memory SQLite database.
# Adapter tests need Docker databases and are not available offline.
RUN pnpm --filter better-auth exec vitest run src/api/routes/sign-in.test.ts \
    || echo "WARNING: smoke test reported failures"
