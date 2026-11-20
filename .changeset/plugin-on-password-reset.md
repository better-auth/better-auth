---
"@better-auth/core": minor
"better-auth": minor
---

A plugin can now act when a user's password is reset by declaring `onPasswordReset`. It receives the `userId` and the endpoint context after `/reset-password`, `/email-otp/reset-password`, or `/phone-number/reset-password` saves the new password. It runs after the user's sessions are revoked when `emailAndPassword.revokeSessionsOnPasswordReset` is on, and also for a user with no live session, which a session hook cannot see. When a hook throws, the other plugins' hooks still run, and the request then fails with the first error. The reset has already taken effect.
