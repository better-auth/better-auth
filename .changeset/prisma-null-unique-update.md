---
"@better-auth/prisma-adapter": patch
---

An `update` whose `where` compares a unique field with `null` now runs. Before, Prisma rejected the query, because the adapter sent the `null` to Prisma's single-row `update`, which needs a non-null unique value.

An `update` without a unique value in its `where` now changes only one matching row and returns that row, including when the update changes a field the `where` filters on or the row's `id`. Before, it changed every matching row and could return `null` or a row it had not changed. Use `updateMany` to change every matching row.
