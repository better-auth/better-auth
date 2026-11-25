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

Adapters now expose `createMany` for inserting many rows of one model in one call. The factory always provides it, chunks statements by parameter and row limits, inserts mixed-key rows one at a time, uses a 100-parameter limit on D1, caps SQL Server at 1000 rows, and falls back to sequential `create` when an adapter has no native implementation or cannot return generated ids in bulk. Adapters that preserve insert order (Postgres/SQLite `RETURNING`, MongoDB) bulk-insert generated ids. MySQL and SQL Server restore order by id after unordered read-back.
