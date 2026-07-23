---
"better-auth": patch
---

Handle Better Auth initialization promise rejections immediately so startup configuration errors do not emit unhandled rejection warnings before `$context` or `handler` is awaited.
