---
"@better-auth/core": patch
"better-auth": patch
---

Rate limiting is now enforced in a single atomic step on the request instead of checking the count on the request and incrementing it on the response. Concurrent requests can no longer all pass the same stale count and bypass the limit. The in-memory store is now bounded (expired entries are swept and the map is capped), and the database backend prunes expired rows in the background. A new optional `consume` method on the rate-limit storage contract performs the atomic check-and-increment (backed by `incrementOne` for the database and by `SecondaryStorage.increment` for secondary storage); a storage without it falls back to the previous best-effort behavior with a one-time warning.
