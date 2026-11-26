---
"@better-auth/drizzle-adapter": patch
---

The `relations-v2` Drizzle schema generator no longer emits a table-level `uniqueIndex(...)` for fields that are both `unique: true` and `index: true`, such as `organization.slug`. These fields already get a column-level `.unique()`, so the extra index created a second, identical unique index in the database.
