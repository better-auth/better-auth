---
"@better-auth/sso": minor
---

OIDC SSO providers that use `tokenEndpointAuthentication: "private_key_jwt"` can now sign client assertions for the provider's registered `issuer`, as RFC 10070 §4 asks, by setting the new `oidcConfig.clientAssertionAudience: "issuer"`. Assertions still name the token endpoint URL by default, which most identity providers require. Set `"issuer"` to sign in to a Better Auth 1.8 authorization server, which by default accepts only its issuer.
