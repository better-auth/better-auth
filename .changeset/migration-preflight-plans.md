---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
"auth": patch
"better-auth": patch
---

`auth migrate` now upgrades a populated Better Auth 1.6 database on its own, using the built-in SQL configuration or a SQL-backed Drizzle or Prisma adapter. It recognizes 1.6 data, reports the adapter, dialect, and populated legacy tables it found, and derives each provider's account issuer from your configuration. It asks only for what the configuration cannot answer: whether a table found under an undeclared name holds a retired model's 1.6 data, an issuer for an unresolvable provider or account, how 1.6 OAuth client secrets are stored, whether stored consents move or users grant them again, and confirmation of the SCIM accounts it retires. Every irreversible action is listed in one final confirmation before anything is written.

The command has two actions. `auth migrate plan` only reads the database; `auth migrate apply` performs the reviewed data and schema changes together. Answers are recorded in `better-auth-migration.json`, a versioned file you can review, commit, and pass back positionally to either action, and it is never replaced by a different set of decisions. Add `--json` to either action for machine-readable output. A run that still needs decisions and has neither a terminal nor a decisions file exits with the full blocker list instead of guessing. Plain `auth migrate` remains available and prints its replacement command.

A MySQL database left with an empty `issuer` on every account row is now repaired rather than passed over. An earlier migration could write that empty value instead of failing, and the backfill then read those rows as already migrated, so sign-in kept rejecting the accounts. The migration now treats an empty issuer as one that still needs a value, drops a compound account index that was built over the empty values before it backfills real issuers, and recreates that index once every row is verified. On MySQL and SQL Server it also bounds the account identity columns so the compound index fits the dialect's index-key limit.

`getMigrations` now returns what it found instead of failing while it builds the plan: the result carries `migrationBlockers` and `unsafeChanges`, and the `UnsafeMigrationError` for a change that would leave existing rows without a correct value is raised when you run or compile that plan. `auth generate` is unchanged and still writes the statements with a warning banner.

A raw Kysely dialect must now declare its database type before migrating, which prevents the CLI from generating SQLite SQL for another database.
