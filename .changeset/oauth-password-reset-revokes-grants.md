---
"@better-auth/oauth-provider": minor
---

A password reset now revokes the access and refresh tokens stored for the user, including `offline_access` grants that no session holds. Before, an offline grant created during a compromise kept working after the reset. It applies when `emailAndPassword.revokeSessionsOnPasswordReset` is on, to `/reset-password` and the email OTP and phone number reset endpoints, and for a user with no live session. A client that refreshes afterwards gets `invalid_grant`. With `revocableJwtAccessTokens`, the JWT access tokens of grants that have a stored refresh token or opaque access token are revoked too. A JWT issued without a refresh token stays valid until it expires, and a resource server that verifies JWTs locally does not see the revocation. Signing out and revoking all sessions still keep `offline_access` grants. Set `revokeGrantsOnPasswordReset: false` to keep a user's tokens across a reset.
