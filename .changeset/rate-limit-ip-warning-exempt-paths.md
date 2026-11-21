---
"better-auth": patch
---

The missing client IP warning is no longer logged for paths whose custom rate limit rule is `false`, so it now appears only when a rate-limited request has no client IP.
