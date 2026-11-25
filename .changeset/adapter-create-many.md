---
"@better-auth/core": minor
"better-auth": minor
"@better-auth/kysely-adapter": minor
"@better-auth/drizzle-adapter": minor
"@better-auth/prisma-adapter": minor
"@better-auth/mongo-adapter": minor
"@better-auth/memory-adapter": minor
"@better-auth/test-utils": minor
---

Adapters now expose `createMany` for inserting many rows of one model in one call. The factory always provides it, chunks statements by the union of batch keys, uses a 100-parameter limit on D1, caps SQL Server at 1000 rows, and falls back to sequential `create` when an adapter has no native implementation. Kysely, Drizzle, and Prisma reorder bulk results by id and insert generated-id rows one at a time. SQL MySQL paths, and Prisma providers without `createManyAndReturn`, run insert-then-read-back in one transaction.
