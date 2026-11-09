---
"better-auth": patch
---

Fix `deferSessionRefresh` refresh requests failing with 415 in Next.js and Nuxt, where the bodyless `POST /get-session` reached the handler as an empty stream without a `Content-Type`.
