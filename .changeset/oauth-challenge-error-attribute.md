---
"@better-auth/core": patch
"@better-auth/oauth-provider": patch
---

Report `error="invalid_token"` in the `WWW-Authenticate` challenge when a protected resource request presented an access token that failed, so clients can tell a rejected token from credentials that were never sent. A request using an unsupported authorization scheme is no longer answered with a DPoP challenge and keeps its `resource_metadata` pointer.
