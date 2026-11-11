---
"@better-auth/oauth-provider": minor
---

Added the `requireOpenId` option to `oauthProvider`. When it is `true`, an authorization request that leaves out the `openid` scope, or sends no `scope`, is redirected to the client's validated `redirect_uri` with `invalid_scope`, so the provider serves only OpenID Connect requests. The option defaults to `false`, which keeps the current behavior, and `openid` must be in `scopes`.
