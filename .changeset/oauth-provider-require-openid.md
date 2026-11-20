---
"@better-auth/oauth-provider": patch
---

Added the `requireOpenId` option to `oauthProvider`. When it is `true`, a request to `/oauth2/authorize` that leaves out the `openid` scope, or sends no `scope`, is redirected to the client's validated `redirect_uri` with `invalid_scope`, so the provider serves only OpenID Connect requests there. The option does not apply to device authorization requests. It defaults to `false`, which keeps the current behavior, and `openid` must be in `scopes`.
