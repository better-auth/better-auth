---
"@better-auth/core": patch
"better-auth": patch
"@better-auth/kysely-adapter": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
"@better-auth/mongo-adapter": patch
"@better-auth/memory-adapter": patch
"@better-auth/test-utils": patch
---

Adapters now expose `createMany` for inserting many rows of one model in one call. The factory always provides it, chunks statements by the union of batch keys, uses a 100-parameter limit on D1, caps SQL Server at 1000 rows, and falls back to sequential `create` when an adapter has no native implementation. Kysely, Drizzle, and Prisma reorder bulk results by id and insert generated-id rows one at a time. SQL MySQL paths, and Prisma providers without `createManyAndReturn`, run insert-then-read-back in one transaction.
