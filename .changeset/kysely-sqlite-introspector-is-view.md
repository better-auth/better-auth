---
"@better-auth/kysely-adapter": patch
---

Fix the bundled SQLite introspectors (`BunSqliteDialect`, `NodeSqliteDialect`) so that tables are no longer reported as views. The introspector queries only rows where `type = 'table'`, but each `TableMetadata` was returned with `isView: true`. Consumers that branch on `isView` (CLI codegen, schema diffing) now see the correct value.
