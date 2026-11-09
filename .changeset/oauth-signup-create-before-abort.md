---
"better-auth": patch
---

OAuth sign-up rejected by a `user.create.before` hook returning `false` now redirects with `FAILED_TO_CREATE_USER` instead of logging a `TypeError` and failing with the generic `unable_to_create_user` error.
