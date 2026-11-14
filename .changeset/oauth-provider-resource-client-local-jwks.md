---
"@better-auth/oauth-provider": patch
---

`oauthProviderResourceClient(auth)` now reads the signing keys from the auth instance instead of requesting its own `/jwks` endpoint, so APIs served from the same app as the auth server can verify tokens on runtimes that block requests to their own hostname. Set `jwksUrl` to keep fetching the keys over HTTP.
