---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
"auth": patch
"better-auth": patch
---

`auth migrate` now upgrades populated Better Auth 1.6 databases using the built-in SQL configuration or a SQL-backed Drizzle or Prisma adapter. It derives migration decisions from the configuration, reviews dynamic issuers per account, verifies the source and target OAuth client-secret storage policies, and shows every irreversible action before writing.

The command records answers in `better-auth-migration.json` for review and replay with `auth migrate --plan better-auth-migration.json`. It never replaces a different existing decisions file. Use `--dry-run` for a readable preview or `--json` for machine-readable output. Both leave the database unchanged, and a non-interactive migration exits instead of guessing when decisions are missing.

A raw Kysely dialect must now declare its database type before migrating, which prevents the CLI from generating SQLite SQL for another database.
