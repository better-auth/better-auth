---
"better-auth": patch
---

`deleteUserSessions` and `deleteUser` now fail closed when using `secondaryStorage`: if the cached session eviction fails, the call rejects before any database rows are touched, instead of reporting success while revoked sessions keep working from the cache.