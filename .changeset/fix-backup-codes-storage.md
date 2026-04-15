---
"better-auth": patch
---

fix(two-factor): preserve backup codes storage format after verification

After using a backup code, remaining codes are now re-saved using the same `storeBackupCodes` strategy (plain, encrypted, or custom) configured by the user. Previously, codes were always re-encrypted with the built-in symmetric encryption, breaking subsequent verifications for plain or custom storage modes.
