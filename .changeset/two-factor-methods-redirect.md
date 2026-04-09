---
"better-auth": patch
---

feat(two-factor): include enabled 2fa methods in sign-in redirect response

The 2FA sign-in redirect now returns `twoFactorMethods` (e.g. `["totp", "otp"]`) so frontends can render the correct verification UI without guessing. The `onTwoFactorRedirect` client callback receives `twoFactorMethods` as a context parameter.

- TOTP is included only when the user has a verified TOTP secret and TOTP is not disabled in config.
- OTP is included when `otpOptions.sendOTP` is configured.
- Unverified TOTP enrollments are excluded from the methods list.
