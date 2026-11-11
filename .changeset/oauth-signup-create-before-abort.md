---
"better-auth": patch
---

OAuth sign-up rejected by a `user.create.before` hook returning `false` no longer logs a `TypeError`. It still fails with `unable_to_create_user`.
