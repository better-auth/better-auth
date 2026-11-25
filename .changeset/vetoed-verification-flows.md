---
"better-auth": patch
---

Magic link, password reset, account deletion, one-time token, SIWE nonce, two-factor OTP, and two-factor sign-in no longer hand out a link, code, token, or challenge when a `verification.create.before` database hook returns `false`. Before, they sent something that could never be verified. Most of these endpoints now fail with `FAILED_TO_CREATE_VERIFICATION` (HTTP 500). Password reset sends no email and returns its usual reply, so it still does not reveal whether the account exists. Sign-in still succeeds when the hook vetoes an optional record: a trusted device is not trusted, and the `set-ott` header is left out.
