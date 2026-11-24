---
"better-auth": patch
---

Two-factor enable, disable and enrollment now carry the session over when they replace it, with a new token and expiry. The replacement keeps the original sign-in time for `session.freshAge`, even after a password check, and keeps session field values instead of resetting fields that have a `defaultValue`.
