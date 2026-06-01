---
"better-auth": patch
---

`getSessionCookie` now prefers the `__Secure-` cookie when both it and a non-secure cookie are present, so the non-secure cookie no longer shadows the current session cookie.
