---
"better-auth": patch
---

OAuth sign-ups rejected by a `user.create.before` hook that returns `false` now end on the error page with `FAILED_TO_CREATE_USER`, the same code email sign-up returns, instead of the generic `unable_to_create_user`. No action is needed.
