---
"better-auth": patch
---

fix(next-js): replace cookie probe with header-based RSC detection in `nextCookies()` to prevent infinite router refresh loops and eliminate leaked `__better-auth-cookie-store` cookie. Also fix two-factor enrollment flows to set the new session cookie before deleting the old session.
