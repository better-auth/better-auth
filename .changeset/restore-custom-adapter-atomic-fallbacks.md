---
"@better-auth/core": patch
---

Make `consumeOne` and `incrementOne` optional again for custom database adapters, using guarded fallbacks when native methods are absent. Fallbacks require atomic conditional writes and accurate affected-row counts. Fallback increments can fail when contention exhausts their retries.
