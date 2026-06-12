---
"@better-auth/core": minor
---

Add the required `incrementOne` adapter primitive and required `SecondaryStorage.increment` method. `incrementOne` atomically applies signed numeric deltas to a single row under a where-clause guard (for example, decrementing a remaining-uses counter only while it is still positive) and returns the updated row, or null when the guard matched no row. Custom adapters must implement this primitive natively; Better Auth no longer provides a transaction-based fallback for guarded increments. `SecondaryStorage.increment` atomically increments a counter and sets its time-to-live only when the key is first created.
