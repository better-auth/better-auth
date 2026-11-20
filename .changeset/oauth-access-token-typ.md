---
"@better-auth/oauth-provider": minor
---

The OAuth provider now accepts a JWT as an access token only when its header has `typ: at+jwt` (RFC 9068 §4). Introspection, revocation, UserInfo, token exchange, and `verifyResourceRequest` apply the check. Previously, the provider could accept another JWT it signed if that token had `azp` and met the other access token checks. `requireMcpAuth` rejects such a JWT as well when it checks tokens through the provider in the same process, which is the default when `jwksUrl` is not set.

**Breaking for custom signers:** a custom `jwt.sign` in the JWT plugin must apply its `header` argument, which carries `typ: at+jwt`. The provider rejects access tokens from a signer that drops it. The provider logs a warning at startup when `jwt.sign` is set.
