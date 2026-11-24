---
"better-auth": patch
---

`generateBackupCodes` refreshes store-backed sessions before checking whether two-factor authentication is enabled. A session cached before enrollment can now generate backup codes, and a revoked session is rejected even while its cookie is still cached.
