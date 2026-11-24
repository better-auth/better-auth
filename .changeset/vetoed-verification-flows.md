---
"better-auth": patch
---

Magic link, password reset, account deletion, one-time token, SIWE nonce, two-factor OTP, and two-factor sign-in no longer hand out a link, code, token, or challenge when a `verification.create.before` database hook returns `false`. These endpoints now fail with `FAILED_TO_CREATE_VERIFICATION` (HTTP 500) instead of sending something that can never be verified. When the hook vetoes a trusted-device record, two-factor verification and sign-in still succeed, but the device is not trusted and no trust-device cookie is set.
