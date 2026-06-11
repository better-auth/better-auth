---
"@better-auth/core": patch
---

Add the optional `incrementOne` adapter method and the optional `SecondaryStorage.increment` method. `incrementOne` atomically applies signed numeric deltas to a single row under a where-clause guard (for example, decrementing a remaining-uses counter only while it is still positive) and returns the updated row, or null when the guard matched no row. Adapters that do not implement it natively keep working through a transaction-based fallback. `SecondaryStorage.increment` atomically increments a counter and sets its time-to-live only when the key is first created.
