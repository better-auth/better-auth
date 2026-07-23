---
"better-auth": patch
---

Require TOTP or backup code to disable 2FA

The `disableTwoFactor` endpoint now accepts a `code` parameter (TOTP code or backup code) instead of `password`. This applies to TOTP-enabled accounts. OTP-only accounts without a TOTP secret continue to require password verification.
