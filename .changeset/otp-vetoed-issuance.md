---
"better-auth": patch
---

Email OTP and phone number OTP no longer send a code when a `verification.create.before` database hook returns `false`. Before, the code was sent even though it was never stored, so every attempt to use it failed with `INVALID_OTP`.

- Sign-in codes, phone verification codes, and the server-only `createVerificationOTP` now fail with `FAILED_TO_CREATE_VERIFICATION` (HTTP 500).
- Endpoints whose reply hides whether an account exists send nothing and return their usual reply. This covers password reset, email verification, change email, and sign-in codes when `disableSignUp` is set.
- With `sendVerificationOnSignUp`, sign-up still succeeds without sending a code, and the error is logged. The user can request a new code later.
