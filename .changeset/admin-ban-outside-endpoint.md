---
"better-auth": patch
---

The admin plugin now rejects banned users when a session is created outside an endpoint, such as through `internalAdapter.createSession`.
