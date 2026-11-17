---
"@better-auth/oauth-provider": minor
---

The OAuth provider now accepts a JWT as an access token only when its header has `typ: at+jwt` (RFC 9068 §4). Before, any JWT signed with the provider's keys that carried `azp`, such as one app code signed with `auth.api.signJWT`, passed at introspection, revocation, UserInfo, token exchange, and `verifyResourceRequest`. `requireMcpAuth` rejects such a JWT as well when it checks tokens through the provider in the same process, which is the default when `jwksUrl` is not set.

**Breaking for custom signers:** a custom `jwt.sign` in the JWT plugin must apply its `header` argument, which carries `typ: at+jwt`. Access tokens from a signer that drops it are now inactive. The provider logs a warning at startup when `jwt.sign` is set.
