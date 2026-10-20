---
"better-auth": patch
"@better-auth/core": patch
---

Fixed sessions kept only in secondary storage staying valid after the transaction that created them rolled back or was retried, which left extra active sessions for the user.
