---
"@better-auth/prisma-adapter": patch
---

An `update` whose `where` compares a unique field with `null` now runs. Before, Prisma rejected the query, because the adapter sent the `null` to Prisma's single-row `update`, which needs a non-null unique value. As with any `where` that has no unique value, the update applies to every matching row and returns one of them.

An `update` without a unique value in its `where` now also returns the updated row when the update changes a field the `where` filters on. Before, it returned `null` after saving the change.
