# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Better Auth is a comprehensive, framework-agnostic authentication library for TypeScript.

## Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Type check
pnpm typecheck
```

Do not run `pnpm test` directly because it runs tests in all packages, which takes a long time,
use `vitest /path/to/<test-file> -t <pattern>` to run specific tests.

## Architecture

### Package Structure

- `packages/better-auth` - Main authentication library
- `packages/core` - Core utilities and types
- `packages/cli` - Command-line interface
- `packages/*` - Various plugins and integrations

## Code Style

- Avoid classes; prefer functions
- Do not use runtime-specific feature like `Buffer` in codebase except test, use `Uint8Array` instead.

## Testing

- Most of the tests use Vitest
- Some tests under `e2e` directory use playwright
- Adapter tests require Docker containers running (`docker compose up -d`)

## Documentation

- Please update the documentation when you make changes to the public API
- Documentation is located in the `docs/` directory, built with
  [Next.js](https://nextjs.org/) + [Fumadocs](https://fumadocs.dev/)

## Git Workflow

- PRs should target the `canary` branch
- Commit format: `feat(scope): description` or `fix(scope): description`,
  following [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
- Use `docs:` for documentation, `chore:` for non-functional changes

## After Everything is done

**Unless the user asked for it or you are working on CI, DO NOT COMMIT**

- Make sure `pnpm format`, `pnpm lint` and `pnpm typecheck` pass
