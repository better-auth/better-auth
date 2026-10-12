---
"better-auth": patch
---

Fix `findSessions` dropping database-backed sessions when the secondary storage cache entry has been evicted. With `secondaryStorage` configured as a read-through cache and `session.storeSessionInDatabase` enabled, `findSessions` now falls back to a batch database lookup for tokens missing from the cache, restoring parity with `findSession` and keeping multi-session device lists and session rotation working across cache evictions.
