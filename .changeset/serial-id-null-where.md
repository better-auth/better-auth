---
"@better-auth/core": patch
---

With `advanced.database.generateId: "serial"`, filtering an `id` or reference field with `null` no longer compares it with `0`. Queries that use `eq` or `ne` with `null` now match the rows you expect.
