---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
"auth": patch
"better-auth": patch
---

`auth migrate plan` now reports schema changes, release actions, and blockers without changing the database. `auth migrate apply` confirms and performs the reviewed data and schema changes together, while `--json` provides deterministic output for automation. Plain `auth migrate` remains available as a deprecated alias for `migrate apply`.

When upgrading a populated Better Auth 1.6 SQL database, the CLI can now backfill account issuers, move OAuth clients and eligible consents, revoke legacy provider tokens, and retire legacy SCIM state before reprovisioning. Decisions that require review are saved in `better-auth-migration.json` with the `1.6-to-1.7` transition and effective issuer values, so the same choices can be inspected and replayed without silently changing under another configuration. The migration also repairs accounts left with empty MySQL issuers and keeps indexed identity fields within MySQL and SQL Server limits.

`getMigrations` results now expose unsafe changes and migration blockers for inspection, while running or compiling an unsafe migration still fails before changing data. SQL-backed Drizzle and Prisma adapters can use the guided migration, and custom Kysely dialects must declare `database.type` so the CLI emits the correct SQL.
