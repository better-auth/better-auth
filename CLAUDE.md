# CLAUDE.md

This file provides guidance to AI assistants (Claude Code, Cursor, etc.)
when working with code in this repository.

## Project Overview

Better Auth is a comprehensive, framework-agnostic authentication
framework for TypeScript.

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

# Format code
pnpm format

# Check formatting for markdown
pnpm format:check

# Spell check
pnpm lint:spell

# Check for unused dependencies/exports
pnpm lint:dependencies

# Run E2E smoke tests
pnpm e2e:smoke

# Run E2E integration tests (requires Playwright)
pnpm e2e:integration
```

Do not run `pnpm test` directly because it runs tests in all packages,
which takes a long time, use `vitest /path/to/<test-file> -t <pattern>` to
run specific tests.

## Architecture

### Repository Layout

* `packages/` - All library packages (see below)
* `docs/` - Documentation site (Next.js + Fumadocs)
* `landing/` - Marketing/landing site
* `demo/` - Demo apps (Next.js, Expo, Electron, stateless, OIDC client)
* `e2e/` - End-to-end tests (smoke, adapter, integration)
* `test/` - Shared unit tests (OIDC, proxy-agent, types)

### Package Structure

**Core**

* `packages/better-auth` - Main authentication library (OAuth, OIDC, 2FA,
  social login, plugins)
* `packages/core` - Core utilities, types, DB adapter interface, and
  OAuth2 primitives
* `packages/cli` - Command-line interface (init, schema, migrations)

**Database Adapters**

* `packages/prisma-adapter` - Prisma adapter
* `packages/drizzle-adapter` - Drizzle ORM adapter
* `packages/kysely-adapter` - Kysely adapter
* `packages/mongo-adapter` - MongoDB adapter
* `packages/memory-adapter` - In-memory adapter

**Plugins**

* `packages/api-key` - API key plugin
* `packages/passkey` - Passkey/WebAuthn plugin
* `packages/sso` - SSO plugin (SAML, OAuth, OIDC)
* `packages/scim` - SCIM plugin for user provisioning
* `packages/stripe` - Stripe plugin for payments/subscriptions
* `packages/oauth-provider` - OAuth provider plugin
* `packages/i18n` - Internationalization for error messages

**Integrations & Utilities**

* `packages/expo` - Expo/React Native integration
* `packages/electron` - Electron integration
* `packages/redis-storage` - Redis secondary storage
* `packages/telemetry` - Telemetry for auth usage
* `packages/test-utils` - Adapter test utilities

### Build Tooling

* **Turborepo** orchestrates builds, tests, and linting across the
  monorepo (`turbo.json`)
* **tsdown** is the build tool used by most packages
* **pnpm workspaces** with catalogs for shared dependency versions
  (`pnpm-workspace.yaml`)

## Code Style

* Formatter: Biome (tabs for code, 2-space for JSON)
* Avoid unsafe typecasts or types like `any`
* Avoid classes, use functions and objects
* Do not use runtime-specific feature like `Buffer` in codebase except
  test, use `Uint8Array` instead

## Testing

* Most of the tests use Vitest
* E2E tests are organized into three categories under `e2e/`:
  * `e2e/smoke/` - Smoke tests (build validation, typecheck, etc.)
  * `e2e/adapter/` - Adapter tests (Prisma, Drizzle, Kysely, Mongo,
    Memory) — require Docker containers (`docker compose up -d`)
  * `e2e/integration/` - Playwright-based integration tests
* Consider using test helpers like `getTestInstance()` from
  `better-auth/test` first
* If a test is to prevent regression of a specific numbered GitHub issue,
  add a JSDoc `@see` comment with the issue URL above the `it()` or `describe()`:
  ```typescript
  /**
   * @see https://github.com/better-auth/better-auth/issues/{issue_number}
   */
  it("should handle the previously broken behavior", async () => {
    // ...
  });
  ```

## Documentation

* Please update the documentation when you make changes to the public API
* Documentation is located in the `docs/` directory, built with
  [Next.js](https://nextjs.org/docs/llms.txt) + [Fumadocs](https://www.fumadocs.dev/llms.txt)
* Content lives in `docs/content/docs/` organized by topic (authentication,
  adapters, concepts, guides, plugins, examples, reference)

## Git Workflow

* PRs should target the `canary` branch
* Commit format: `feat(scope): description` or `fix(scope): description`,
  following [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
* Use `docs:` for documentation, `chore:` for non-functional changes

## After Everything is done

**Unless the user asked for it or you are working on CI, DO NOT COMMIT**

* Make sure `pnpm format:check`, `pnpm lint` and `pnpm typecheck` pass
