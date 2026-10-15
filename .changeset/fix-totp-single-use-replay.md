---
"better-auth": patch
---

TOTP codes can now only be used once: each verified code is atomically recorded in the verification table and replays are rejected with `INVALID_CODE`. Applies to sign-in and step-up verification; failed pre-session verifications release the record so retry is unaffected.
