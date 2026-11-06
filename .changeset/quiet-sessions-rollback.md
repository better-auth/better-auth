---
"better-auth": patch
"@better-auth/core": patch
---

Fixed sessions kept only in secondary storage staying valid after the transaction that created them rolled back or was retried, which left extra active sessions for the user. The cleanup also re-reads the active-session list before writing so a concurrent sign-in is less likely to be dropped from it.
