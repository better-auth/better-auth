---
"better-auth": patch
---

Resetting a password with an email OTP now verifies the email even when `onPasswordReset` throws, and, with adapter transactions enabled, a failed `emailVerified` write no longer leaves the new password in place. `onPasswordReset` receives the updated user.
