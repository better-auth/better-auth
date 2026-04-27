---
"better-auth": patch
"@better-auth/core": patch
---

`changePassword({ revokeOtherSessions: true })` no longer signs the caller out; only other devices' sessions are revoked.
