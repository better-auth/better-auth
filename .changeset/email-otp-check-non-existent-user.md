---
"better-auth": patch
---

fix(email-otp): allow `checkVerificationOTP` for non-existent users during signup

Match the guard already used by `sendVerificationOTP`: when `type === "sign-in"` and `disableSignUp` is false, skip the `USER_NOT_FOUND` throw so signup flows can verify the OTP before the account row exists.
