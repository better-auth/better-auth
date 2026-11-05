---
"better-auth": minor
---

Phone password reset now works only for a phone number already verified on the account. `requestPasswordReset` no longer sends a code for an unverified number, and `resetPassword` returns `PHONE_NUMBER_PENDING_VERIFICATION` without changing the password.
