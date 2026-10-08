---
"better-auth": patch
---

A sign-up that fails after its session is created no longer leaves that session in secondary storage. When sessions are also stored in the database, the secondary-storage copy is written only after the sign-up commits.
