---
"better-auth": patch
---

Fix database-backed rate limiting returning an excessively large `X-Retry-After` header instead of the remaining seconds in the rate-limit window.
