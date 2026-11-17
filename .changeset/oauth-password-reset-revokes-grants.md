---
"@better-auth/oauth-provider": minor
---

A password reset now revokes every access and refresh token the user holds, including `offline_access` grants that no session holds. Before, an offline grant created during a compromise kept working after the reset. It applies when `emailAndPassword.revokeSessionsOnPasswordReset` is on, to `/reset-password` and the email OTP and phone number reset endpoints, and for a user with no live session. A client that refreshes afterwards gets `invalid_grant`. With `revocableJwtAccessTokens`, the JWT access tokens of those grants are revoked too. Signing out and revoking all sessions still keep `offline_access` grants. Set `revokeGrantsOnPasswordReset: false` to keep a user's tokens across a reset.
