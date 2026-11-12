---
"better-auth": patch
---

`getSession` no longer leaves an expired session in the request context after returning `null`.
