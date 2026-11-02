---
"better-auth": patch
---

Fix `findSession`/`findSessions` throwing when a secondary-storage cache entry was written with a `null` user (e.g. replica lag right after sign-up). `createSession` now retries the user lookup once before caching, and the read paths lazily re-resolve and repair a cached session with no user instead of crashing, falling back to a miss only once the user is confirmed gone.
