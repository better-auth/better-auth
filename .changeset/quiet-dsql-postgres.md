---
"@better-auth/dsql-adapter": minor
"@better-auth/core": minor
"@better-auth/kysely-adapter": minor
"auth": minor
---

Add `@better-auth/dsql-adapter` for Amazon Aurora DSQL. It uses the Kysely adapter's PostgreSQL support, creates indexes with `CREATE INDEX ASYNC`, and retries transactions that DSQL aborts with a serialization error. Both `npx auth generate` and `npx auth migrate` work with it.

Adapters can now set `isRetryableError`, so those errors always reach the adapter's transaction even when a route catches them, and `getMigrations`, to plan their own migrations for `npx auth migrate`. Kysely database configs accept an `introspectIndexes` function, and `createD1Profile` is exported for setting up D1 explicitly.
