---
"better-auth": patch
---

Completing account deletion through `/delete-user/callback` now fails when the session has been revoked server-side, instead of proceeding within the cookie-cache window. Deployments that keep sessions only in the cookie are unaffected.
