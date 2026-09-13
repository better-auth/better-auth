---
"@better-auth/kysely-adapter": patch
"better-auth": patch
"@better-auth/core": patch
---

Add a `database.schemaName` option for direct PostgreSQL connections. When set, the adapter and the CLI qualify every statement with that schema, so `auth generate` writes a schema-qualified migration that creates the schema before its tables instead of relying on the connection's `search_path`.
