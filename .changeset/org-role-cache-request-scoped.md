---
"better-auth": patch
---

Dynamic access control roles reused through `hasPermission`'s `useMemoryCache` option are now cached per request and per auth instance instead of in a process-global cache, so role changes apply on the next request.
