---
"better-auth": patch
"@better-auth/core": patch
---

Password resets and password changes no longer keep the new password when revoking the user's sessions fails. With `revokeSessionsOnPasswordReset` or `revokeOtherSessions`, database sessions are revoked and the password is saved in one transaction when transactions are enabled for the adapter, so a failure leaves the old password and sessions in place. Sessions in secondary storage are still removed after commit, on a best-effort basis. This covers `/reset-password`, the email OTP and phone number reset endpoints, and `/change-password`. `onPasswordReset` now runs after sessions are revoked, so a throwing callback no longer leaves them active, and a callback that lists the user's sessions no longer sees the revoked ones.
