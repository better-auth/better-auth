---
"better-auth": patch
"auth": patch
---

`auth migrate` no longer attempts to add a required column with no default value to a table that already has rows. It stops with an error naming the column and the backfill to run first. Previously the generated statement failed on SQLite, Postgres, and SQL Server; on MySQL it filled the new column with an empty string for every existing row and reported success. If `auth migrate` already ran against a MySQL database on 1.7, run the check in the upgrade guide's account identity section.

`auth generate` still emits the statements for external migration tooling, with a comment banner naming any column that needs a manual backfill first.

A required field whose database column is still nullable logs a warning instead of blocking the migration.

A CLI command that fails now prints its error and exits with a non-zero code instead of an unhandled promise rejection.
