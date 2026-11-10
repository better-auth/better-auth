---
"@better-auth/kysely-adapter": patch
"better-auth": patch
---

If you use PostgreSQL and other schemas in the same database are dropped while Better Auth reads the database, for example one schema per tenant or parallel test runs, the startup schema check and `npx auth@latest migrate` no longer fail intermittently with `schema "…" does not exist` or `relation "…" does not exist`. The startup schema check now reads only the schemas on the connection's `search_path`, plus any schema set with `schemaName` or a schema plugin, and `migrate` reads only the schema it migrates. Before, both read every schema in the database. If no other schemas change while Better Auth reads the database, nothing changes for you.
