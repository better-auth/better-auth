---
"better-auth": patch
---

Add `internalAdapter.consumeVerificationValue(identifier)`: atomically consume a verification row keyed by identifier. The first concurrent caller receives the row; later racers receive `null`. Backed by a new `DBAdapter.claimOne` primitive implemented natively per adapter (memory, mongo, drizzle, kysely, prisma), with a `transaction(findMany + delete)` factory fallback. `SecondaryStorage.getAndDelete` is added as an optional companion; Redis ships it via `GETDEL`.
