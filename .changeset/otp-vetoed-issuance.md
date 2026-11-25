---
"better-auth": patch
---

Email OTP and phone number OTP no longer send a code when a `verification.create.before` database hook returns `false`. Before, the code was sent even though it was never stored, so every attempt to use it failed with `INVALID_OTP`. Sign-in codes, phone verification codes, sign-up verification, and the server-only `createVerificationOTP` now fail with `FAILED_TO_CREATE_VERIFICATION` (HTTP 500). Endpoints whose reply hides whether an account exists, such as password reset, email verification, and change email, send nothing and return their usual reply.
