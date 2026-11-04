---
"better-auth": patch
---

OAuth sign-ups rejected by a `user.create.before` hook that returns `false` now return `FAILED_TO_CREATE_USER` instead of the generic `unable_to_create_user`; redirect-based flows carry it as `?error=`, while id-token and One Tap flows return HTTP 400. No action is needed.
