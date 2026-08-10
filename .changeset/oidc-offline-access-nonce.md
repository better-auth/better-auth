---
"@better-auth/oauth-provider": patch
---

Allows confidential OIDC clients that have opted out of PKCE to request `offline_access` when the authorization request includes both `openid` and `nonce`.
