---
"@better-auth/memory-adapter": patch
"@better-auth/kysely-adapter": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
"@better-auth/mongo-adapter": patch
---

The memory, Kysely, Drizzle, Prisma, and MongoDB adapters now implement `incrementOne` natively (a single atomic statement: an arithmetic `UPDATE ... RETURNING`, Prisma's atomic increment, or Mongo's `findOneAndUpdate` with `$inc`). Guarded counter updates no longer depend on the transaction-based fallback, so they stay atomic even on the default configuration where adapter transactions are not enabled.
