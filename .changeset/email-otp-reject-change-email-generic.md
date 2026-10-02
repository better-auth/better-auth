---
"better-auth": patch
---

The email OTP `checkVerificationOtp`, `createVerificationOTP` and `getVerificationOTP` methods now reject the `change-email` type with an "Invalid OTP type" error, the same as `sendVerificationOtp`. Before, checking a valid change-email OTP always failed with "Invalid OTP", and the server methods created or returned an OTP that `changeEmail` could not accept. Use `requestEmailChange` and `changeEmail` to change an email with OTP.
