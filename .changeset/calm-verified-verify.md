---
"better-auth": patch
---

Stop `/email-otp/verify-email` from re-verifying an already verified account. The code is still consumed and the request returns the user with `token: null`, but the account is not updated, `beforeEmailVerification` and `afterEmailVerification` do not run, and no session is created even with `autoSignInAfterVerification`, as with the core `/verify-email` endpoint.
