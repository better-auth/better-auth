# Better Auth Development Guide

This is the Better Auth repository - a comprehensive authentication framework for TypeScript, designed to be runtime and framework-agnostic.

## Project Structure

- `packages/better-auth` - Main authentication library
- `packages/core` - Shared core types and utilities
- `packages/cli` - CLI tool
- `packages/*` - Database adapters, plugins, integrations
- `docs/` - Documentation site (Next.js + Fumadocs), content in `docs/content/docs/`
- `test/` - Shared test workspace
- `e2e/` - End-to-end tests (smoke, adapter, integration)
- `demo/` - Example apps

## Commands

- ALWAYS use `pnpm` (never npm, yarn, or bun)
- NEVER run `pnpm test` (runs all packages). Use `vitest path/to/test -t <pattern>`
- Type check: `pnpm lint:types`
- Formatting/linting runs automatically on commit (Lefthook + Biome). No need to run manually.

## Writing Code

- Must work across Node.js, Bun, Deno, and Cloudflare Workers. Avoid runtime-specific APIs.
- Biome (tabs for code, 2 spaces for JSON)
- NEVER use `any`. NEVER use classes.
- Use `Uint8Array` instead of `Buffer` (except in tests)
- Import zod as `import * as z from "zod"`
- Use `import type` for type-only imports
- Use `node:` protocol for Node.js built-ins (e.g. `node:crypto`)
- JSDoc comments for public APIs
- Plugins should be as independent as possible. When working on a plugin, prefer modifying the plugin over changing core.

## Testing

- Most tests use Vitest; some under `e2e/` use Playwright
- Use `getTestInstance()` from `better-auth/test`. It returns `{ client, auth, sessionSetter, ... }`
- Pass client plugins via `clientOptions.plugins`
- NEVER create separate clients with `createAuthClient()` in tests
- Default test DB is SQLite in-memory; use `testWith` for other databases
- Adapter tests need Docker: `docker compose up -d`
- Regression tests: add `@see` comment with issue URL above `it()` or `describe()`:
  ```typescript
  /**
   * @see https://github.com/better-auth/better-auth/issues/{issue_number}
   */
  it("should handle the previously broken behavior", async () => {
    // ...
  });
  ```

## Important Development Notes

- Bug fixes and new features MUST include tests
- For bug fixes: if the issue is reproducible in a test, write a failing test first, then implement the fix
- Update docs (`docs/content/docs/`) when changing public API
- Ensure `pnpm lint:types` passes before finishing
- DO NOT COMMIT unless the user explicitly asks
- Conventional Commits: `feat(scope):`, `fix(scope):`, `docs:`, `chore:`. Use `!` for breaking changes (e.g. `feat(auth)!:`)
- PRs target `main`
