---
"@better-auth/core": patch
---

Make the singular adapter `delete()` a no-op when its `where` is empty, matching `update()`. Previously the Kysely, Drizzle, and Prisma adapters deleted every row and the MongoDB adapter deleted one arbitrary row.
