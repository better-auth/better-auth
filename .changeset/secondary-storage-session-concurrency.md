---
"better-auth": patch
"@better-auth/core": patch
---

Improve secondary-storage session throughput with bounded concurrency, and make bulk session revoke/refresh attempt every key under that cap before surfacing failures (`mapConcurrentSettled`). Also overlap independent reads on session create and skip the active-sessions list rewrite when `updateSession` does not change `expiresAt`.
