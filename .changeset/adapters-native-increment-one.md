---
"@better-auth/memory-adapter": patch
"@better-auth/kysely-adapter": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
"@better-auth/mongo-adapter": patch
---

Counter updates on the memory, Kysely, Drizzle, Prisma, and MongoDB adapters (used for rate limiting and API-key usage limits) are now atomic on the default configuration, where adapter transactions are not enabled. Each adapter implements `incrementOne` natively as a single statement.
