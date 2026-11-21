---
"@better-auth/core": patch
"better-auth": patch
---

Rotating `secrets` no longer signs users out: signed cookies and compact/jwt cookie caches verify against every configured secret (current first) and re-sign with the current secret on read.
