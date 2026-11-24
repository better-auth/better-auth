---
"better-auth": patch
---

Verifying a phone number that no user has, without `signUpOnVerification`, now returns a 400 `PHONE_NUMBER_NOT_EXIST` error instead of a 500.
