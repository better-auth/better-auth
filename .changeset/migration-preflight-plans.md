---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
"auth": patch
"better-auth": patch
---

`auth migrate plan` now inspects schema and release changes without writing to the database, while `auth migrate apply` performs the reviewed changes together. The CLI guides populated Better Auth 1.6 databases through account identity, OAuth provider, and SCIM decisions; records the `1.6-to-1.7` transition and effective configuration values in `better-auth-migration.json`; and supports deterministic JSON output. Plain `auth migrate` remains as a deprecated alias for `migrate apply`.

Migration planning now reports blockers through `getMigrations` and delays `UnsafeMigrationError` until a caller runs or compiles the plan. The release migration repairs empty MySQL account issuers, bounds indexed identity columns where required, and requires custom Kysely dialects to declare their database type before migrating.
