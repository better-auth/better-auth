---
"@better-auth/oauth-provider": minor
---

Extension grants can now pass `idToken: false` to `issueTokens` to skip the ID token while keeping the `openid` scope.

Before, `issueTokens` always signed an ID token when the scopes included `openid`, which blocked grants that keep `openid` for UserInfo but have no sign-in for an ID token to describe. With `idToken: false`, the response has no `id_token` and no ID token claim callback runs. It also has no refresh token, even with `offline_access`, because a refresh would issue an ID token. Passing `idTokenClaims` or `refreshToken` with `idToken: false` throws. The authorization code, refresh token, and CIBA grants still issue an ID token for `openid`.
