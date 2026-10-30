---
"better-auth": patch
---

`/email-otp/request-password-reset` and the deprecated `/forget-password/email-otp` now reject a malformed email with `INVALID_EMAIL` (400) instead of returning success, matching `send-verification-otp`.
