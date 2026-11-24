---
"better-auth": patch
---

Magic link, password reset, account deletion, one-time token, SIWE nonce, two-factor OTP, and two-factor sign-in no longer hand out a link, code, token, or challenge when a `verification.create.before` database hook returns `false`. Before, they sent something that could never be verified. Most of these endpoints now fail with `FAILED_TO_CREATE_VERIFICATION` (HTTP 500). Password reset sends no email and returns its usual response, so it still does not reveal whether the account exists. When the hook vetoes a trusted-device record, two-factor verification and sign-in still succeed, but the device is not trusted and no trust-device cookie is set.
