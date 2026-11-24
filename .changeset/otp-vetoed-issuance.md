---
"better-auth": patch
---

Email OTP and phone number OTP no longer send a code when a `verification.create.before` database hook returns `false`. Before, the code was sent even though it was never stored, so every attempt to use it failed with `INVALID_OTP`. The send endpoints, sign-up verification, change email, and phone number password reset now fail with `FAILED_TO_CREATE_VERIFICATION` (HTTP 500), and `sendVerificationOTP`, `sendOTP`, and `sendPasswordResetOTP` are not called.
