---
"@better-auth/core": minor
"better-auth": minor
---

A plugin can now act when a user's password is reset by declaring `onPasswordReset`. It receives the `userId` and the endpoint context after `/reset-password`, `/email-otp/reset-password`, or `/phone-number/reset-password` saves the new password and revokes sessions. It also runs for a user with no live session, which a session hook cannot see. An error it throws fails the request, but the reset has already taken effect.
