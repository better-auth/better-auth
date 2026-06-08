---
"better-auth": patch
---

Fix 2FA configuration endpoints to bypass the session cookie cache so they always read the current DB state of `user.twoFactorEnabled`.

`twoFactor.enable`, `twoFactor.disable`, `twoFactor.getTotpUri`, and `twoFactor.generateBackupCodes` now use `sensitiveSessionMiddleware`. Previously, a session whose cookie cache held stale `twoFactorEnabled=false` could cause `generateBackupCodes` (and other config endpoints) to reject with `TWO_FACTOR_NOT_ENABLED` even after enrollment had completed in the database (#9132).
