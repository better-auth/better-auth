---
"@better-auth/oauth-provider": patch
---

A token revocation that a `verification.create.before` hook keeps from being recorded now fails with `server_error` instead of reporting success while the token keeps working. This covers revoking a JWT access token with `revocableJwtAccessTokens`, revoking a refresh token, and the grant teardown after a refresh token replay. `onTokenRevoked` is no longer called for these revocations. An authorization code whose reuse record a hook vetoes is now logged, because a replay of that code cannot revoke its grant.
