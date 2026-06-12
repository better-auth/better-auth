---
"@better-auth/redis-storage": patch
---

A rate-limit window backed by Redis secondary storage can no longer be extended by continued traffic; its expiry is set once when the window opens. Redis secondary storage gains an atomic `increment` method used for this enforcement.
