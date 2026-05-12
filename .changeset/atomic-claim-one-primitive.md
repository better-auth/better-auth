---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/kysely-adapter": patch
"@better-auth/memory-adapter": patch
"@better-auth/mongo-adapter": patch
"@better-auth/prisma-adapter": patch
"@better-auth/redis-storage": patch
"better-auth": patch
---

Add `internalAdapter.consumeVerificationValue(identifier)`: atomically consume a verification row keyed by identifier. The first concurrent caller receives the row; later racers receive `null`. Backed by a new `DBAdapter.claimOne` primitive implemented natively per adapter (memory, mongo, drizzle, kysely, prisma), with a `transaction(findMany + delete)` factory fallback. `SecondaryStorage.getAndDelete` is added as an optional companion; Redis ships it via an atomic Lua get-and-delete operation for compatibility with Redis versions before 6.2.
