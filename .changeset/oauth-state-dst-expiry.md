---
"better-auth": patch
---

Fix OAuth sign-in failing with `state_mismatch` during the daylight saving time fall-back hour on servers that don't run in UTC. The stored OAuth state no longer expires before it is created.
