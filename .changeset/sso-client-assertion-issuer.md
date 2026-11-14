---
"@better-auth/sso": minor
---

OIDC SSO providers that use `tokenEndpointAuthentication: "private_key_jwt"` now sign client assertions for the provider's registered `issuer` instead of its token endpoint URL, as RFC 10070 §4 requires. For an identity provider that accepts only its token endpoint URL, set the new `oidcConfig.clientAssertionAudience: "token_endpoint"`.
