---
"@better-auth/prisma-adapter": patch
---

An `update` whose `where` compares a unique field with `null` now updates the matching row. Before, Prisma rejected the query, because the adapter sent it to Prisma's single-row `update`, which needs a non-null unique value.
