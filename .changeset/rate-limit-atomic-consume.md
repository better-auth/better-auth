---
"@better-auth/core": minor
"better-auth": minor
---

Rate limiting is now enforced in a single atomic step on the request instead of checking the count on the request and incrementing it on the response. Concurrent requests can no longer all pass the same stale count and bypass the limit. The in-memory store is now bounded (expired entries are swept and the map is capped), and the database backend prunes expired rows in the background. `BetterAuthRateLimitStorage` now requires a `consume` method that performs the atomic check-and-increment directly; separate `get`/`set` rate-limit storage is no longer accepted.
