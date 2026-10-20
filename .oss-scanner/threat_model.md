# Threat model

## About this project

Better Auth is an auth framework for TypeScript that developers own and run on
their own servers, with users stored in their own database.

## Trust boundaries

Requests enter through the API engine in core (router, middleware, hooks) and
reach core routes and plugin endpoints. Every request is untrusted, including
OAuth callbacks, SAML responses, and webhooks. The application's configuration
and server-side code are trusted. Organization admins and the identity
providers they register are not trusted like the application operator.

## Scope

- In scope: everything under `packages/`, including plugins and client
  libraries
- Out of scope: `docs/`, `demo/`, `e2e/`, `test/`, `packages/test-utils`,
  `packages/release-tooling`, and test files

## How to exercise it

- Run a single test file with `pnpm --filter <package> exec vitest run <path>`.
- `getTestInstance()` from `packages/better-auth/src/test-utils` creates an
  instance backed by in-memory SQLite.
- The origin check is skipped in tests. Set
  `advanced: { disableOriginCheck: false }` for origin or CSRF findings.
- Packages resolve each other through `dist/`. Run `pnpm build` after changing
  a package.

## How you rate severity

Rate impact on the application that uses Better Auth. In order of priority:

1. Authentication bypass or session forgery
2. Account takeover through password reset, email change, magic link, or OAuth
   account linking
3. Open redirect or token leakage through callback URLs
4. Privilege escalation or cross-tenant access in plugins such as admin and
   organization

Plugins are not rated lower for being opt-in. Findings that need a non-default
setting are rated lower, not excluded. Denial of service is low.

## Anything to leave alone

- Usage the docs describe as invalid, such as calling `auth.api` without
  request headers
- Findings that need a protection turned off, such as `disableCSRFCheck` or
  `disableOriginCheck`
- Missing authorization checks in application code around `auth.api` calls
- Reproductions that write sessions, roles, or accounts directly to the
  database instead of going through the endpoints
- Hardcoded secrets in tests, and the `DEFAULT_SECRET` fallback outside
  production when no secret is set
