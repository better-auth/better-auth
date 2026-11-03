---
"better-auth": patch
---

Email verification and change email links now only work for the account they were issued to. Opening a change email link no longer signs the user in, and it verifies the new email only if the current one was verified.
