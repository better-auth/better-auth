---
"@better-auth/oauth-provider": patch
---

Token introspection now requires JWT access tokens to carry an `azp` (client) claim and resolve to an enabled client before being reported as active. This ensures only tokens issued by the OAuth token endpoint are treated as access tokens, since the JWT plugin can mint session JWTs that share the same issuer, audience, and signing keys.
