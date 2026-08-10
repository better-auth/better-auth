---
"@better-auth/oauth-provider": patch
---

`/oauth2/userinfo` now returns a `401 invalid_token` response with a `WWW-Authenticate` challenge when an access token is invalid, expired, revoked, or unknown. `/oauth2/introspect` still reports those tokens as inactive.
