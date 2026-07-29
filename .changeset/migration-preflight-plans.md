---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
"auth": patch
"better-auth": patch
---

`auth migrate` now upgrades a populated Better Auth 1.6 database on its own. It recognizes 1.6 data, reports the adapter, dialect, and populated legacy tables it found, derives each provider's account issuer from your configuration, and asks only for what the configuration cannot answer: whether a table it found under an undeclared name holds a retired model's 1.6 data, an issuer for an unresolvable provider, whether stored OAuth consents move or users grant them again, and confirmation of the SCIM accounts it retires. Every irreversible action is listed in one final confirmation before anything is written. This works with the built-in Kysely adapter and SQL-backed Drizzle or Prisma adapters, including SQLite.

Answers are recorded in `better-auth-migration.json`, a versioned file you can review, commit, and replay with `auth migrate --plan better-auth-migration.json`. It is also how the migration runs without a terminal: a run that still needs decisions and has no file exits with the full blocker list instead of guessing.

`auth migrate --dry-run` previews the plan and `auth migrate --json` returns a machine-readable one, and neither changes the database. Every blocker they report carries a stable code, a one-sentence fix, and a link to the matching section of the upgrade guide. The relational cutover uses one transaction-scoped connection where the dialect supports transactional DDL and stays resumable on MySQL, and retired 1.6 tables are kept as backups.

A database configured as a raw Kysely dialect without a declared type now stops migration with an error asking for the `database: { dialect, type }` form. It previously generated SQLite SQL against whatever database the dialect connected to.
