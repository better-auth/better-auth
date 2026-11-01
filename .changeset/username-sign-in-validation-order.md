---
"better-auth": patch
---

Fixed `/sign-in/username` and `/is-username-available` rejecting a username that sign-up accepts when `validationOrder.username` is `post-normalization`. Both endpoints now validate the same value as sign-up.
