---
"better-auth": patch
---

Skip identical cookie writes in `nextCookies()` after-hook to avoid router cache invalidation when the session token value is unchanged
