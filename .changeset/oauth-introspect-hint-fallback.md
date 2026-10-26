---
"@better-auth/oauth-provider": patch
---

Fix `/oauth2/introspect` reporting a valid token as inactive when it is sent with the wrong `token_type_hint`. Per RFC 7662 the hint now only orders the lookup instead of restricting it. A custom `formatRefreshToken.decrypt` that throws on a token it cannot decode no longer turns the response into a 500.
