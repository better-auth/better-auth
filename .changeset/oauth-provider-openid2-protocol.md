---
"@better-auth/core": patch
"better-auth": patch
---

Social providers can set `protocol: "openid2"` to finish sign-in from an OpenID 2.0 callback that carries no authorization `code`. Better Auth then passes the callback request to the provider's `validateAuthorizationCode` as `request`. Providers that leave `protocol` unset behave as before.
