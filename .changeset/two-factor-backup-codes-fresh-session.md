---
"better-auth": patch
---

`generateBackupCodes` now reads the user from the database instead of the cookie cache, so it no longer fails with `TWO_FACTOR_NOT_ENABLED` when a session cached before two-factor enrollment calls it afterwards, and it rejects a revoked session that is still cached.
