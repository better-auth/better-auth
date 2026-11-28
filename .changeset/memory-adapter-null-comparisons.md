---
"@better-auth/memory-adapter": patch
---

The memory adapter no longer matches rows whose field is `null` with the `lt`, `lte`, `gt` and `gte` operators, matching the SQL and MongoDB adapters. Before, `null` was compared as `0`, so a query such as `expiresAt lt now` also returned, updated or deleted rows with no `expiresAt`.
