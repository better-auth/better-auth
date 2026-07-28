---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
"auth": patch
"better-auth": patch
---

Better Auth can now inspect and migrate populated 1.6 databases through the built-in Kysely adapter and SQL-backed Drizzle or Prisma adapters, including SQLite. `auth migrate --dry-run` previews changes, while `auth migrate --json` returns a versioned plan with the detected adapter and dialect for CI and coding agents without changing the database.

When existing data needs a backfill, conversion, or reprovisioning, schema migration stops and reports the required decision. `auth migrate --from 1.6` then applies reviewed account issuer mappings and OAuth or SCIM choices, preserves retired plugin tables as 1.6 backups, and creates the 1.7 schema.
