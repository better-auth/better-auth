---
"@better-auth/drizzle-adapter": minor
---

Add a `schemaName` option to the Drizzle Relations v2 adapter config. When set on PostgreSQL, schema generation now emits a `pgSchema("...")` namespace and uses namespaced table definitions (for example, `authSchema.user(...)`), matching the v1 CLI generator behavior.
