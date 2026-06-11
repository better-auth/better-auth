---
"@better-auth/core": patch
"better-auth": patch
---

Concurrent requests can no longer slip past the configured rate limit. The in-memory rate-limit store no longer grows without bound, and the database backend removes expired entries on its own. A custom rate-limit storage may implement a new optional `consume` method for strict enforcement; without it, the previous behavior is kept and a one-time warning is logged.
