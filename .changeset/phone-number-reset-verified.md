---
"better-auth": patch
---

With `requireVerification`, phone number password reset now works only for a verified number. No reset code is sent to an unverified number, and `resetPassword` returns `PHONE_NUMBER_PENDING_VERIFICATION` without adding or changing a password.
