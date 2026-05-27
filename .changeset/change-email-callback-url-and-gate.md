---
"better-auth": patch
---

`changeEmail` no longer silently returns `{ status: true }` when the flow cannot complete: if `emailVerification.sendVerificationEmail` is missing for a verified user, the request now fails with a 400 error. `callbackURL` values are also URL-encoded, so callbacks that carry their own query string survive the round trip through verify-email links.
