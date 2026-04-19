---
"@better-auth/oauth-provider": major
---

fix(oauth-provider): read OAuth2 userinfo `Authorization` from `ctx.headers` when `ctx.request` is absent, so `auth.api.oauth2UserInfo({ headers })` matches HTTP `GET /oauth2/userinfo`.
