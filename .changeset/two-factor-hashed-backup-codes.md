---
"better-auth": patch
---

Add a `hashed` mode to the two-factor `storeBackupCodes` option, plus support for a custom `{ hash }` function. Backup codes stored this way are kept as one-way hashes, so they cannot be recovered from the database even with the app secret. The plaintext codes are still returned once when generated, and `viewBackupCodes` throws `BACKUP_CODES_NOT_VIEWABLE` in this mode. Backup code verification now uses a constant-time comparison. The default is still `encrypted`, so existing behavior is unchanged.
