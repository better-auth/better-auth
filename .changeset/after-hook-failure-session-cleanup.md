---
"better-auth": patch
"@better-auth/core": patch
---

Revoked sessions are now removed from secondary storage even when a database `after` hook throws during password reset or user deletion. Before, they could stay valid until they expired.
