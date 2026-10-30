---
"better-auth": patch
---

Looking up a user by email now returns only an account whose stored address matches the requested one, ignoring case, even on databases with accent-insensitive collations. The email OTP password reset routes now validate the address and send the code to the address on the account.
