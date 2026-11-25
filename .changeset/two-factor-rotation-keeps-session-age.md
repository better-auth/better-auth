---
"better-auth": patch
---

Two-factor enable, disable and enrollment now keep the original sign-in time when they replace the session, even after a password check, so the replacement is only as fresh as the session it replaces for `session.freshAge`.
