---
"better-auth": patch
---

`/email-otp/reset-password` now marks the email verified in the same transaction as the new password, so a throwing `onPasswordReset` no longer leaves the email unverified and a failed verification write no longer keeps the new password.
