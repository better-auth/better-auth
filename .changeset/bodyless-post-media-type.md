---
"better-auth": patch
---

Fix `POST` requests sent without a body, such as `/sign-out` or `/revoke-sessions`, failing with 415 on Deno, Next.js, Nuxt and other servers that pass an empty stream as the request body.
