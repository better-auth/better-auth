---
"better-auth": patch
---

Recover secondary-storage sessions after transient user lookup misses instead of caching a null user that breaks later session reads.
