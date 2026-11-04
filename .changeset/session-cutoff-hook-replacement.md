---
"better-auth": patch
---

Fixed sessions created by a `session.delete.after` hook during "revoke all sessions" being treated as revoked immediately when `secondaryStorage` is used with `storeSessionInDatabase`.
