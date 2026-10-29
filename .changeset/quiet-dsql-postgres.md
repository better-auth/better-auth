---
"@better-auth/dsql-adapter": minor
"@better-auth/core": minor
"@better-auth/kysely-adapter": minor
"auth": minor
"better-auth": patch
---

Add a separate Aurora DSQL adapter that reuses Kysely PostgreSQL operations and the existing schema planner. The package owns bounded serialization retries, asynchronous index creation and recovery, and bigint identity definitions. It implements schema generation and the new adapter-owned migration hook, so both `auth generate` and `auth migrate` work through the adapter package.

Adapters can declare `isRetryableError` to preserve confirmed transaction aborts through sign-up error handling, while retaining control of retry execution. Explicit Kysely configurations can supply index introspection, and `createD1Profile` exposes D1's existing dialect and capabilities without changing raw-binding compatibility. Shared core, CLI, and Kysely code do not contain DSQL-specific branches.
