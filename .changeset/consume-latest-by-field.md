---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/kysely-adapter": patch
"@better-auth/memory-adapter": patch
"@better-auth/mongo-adapter": patch
"@better-auth/prisma-adapter": patch
---

Database adapters now expose `consumeLatest`, which deletes the current rows for a field value and returns the latest one. Custom adapters can implement it natively; otherwise Better Auth falls back to the previous find, delete, and consume sequence.
