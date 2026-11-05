---
"better-auth": patch
---

Fixed "revoke all sessions" with `secondaryStorage` and `storeSessionInDatabase` so that sessions created while the revocation runs are revoked too. Sessions created by a `session.delete.after` hook still stay active.
