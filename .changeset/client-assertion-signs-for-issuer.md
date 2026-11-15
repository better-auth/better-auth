---
"@better-auth/core": minor
"better-auth": minor
---

`createPrivateKeyJwtClientAssertionGetter` now signs client assertions for the authorization server's issuer by default when it knows the issuer, as RFC 10070 §4 requires. Generic OAuth passes the issuer from the provider's discovery document, and also passes it to custom `getClientAssertion` functions as `issuer`. The `okta` and `microsoftEntraId` helpers withhold it, so they keep signing for the token endpoint URL that those providers document.

Without a known issuer, the getter still signs for the token endpoint URL. For a server that accepts only its token endpoint URL, set `audience: "token_endpoint"`. With `audience: "issuer"`, a request without a known issuer fails instead of falling back to the token endpoint.

Assertions from `createPrivateKeyJwtClientAssertionGetter` and `signPrivateKeyJwtClientAssertion` now carry the JOSE header `typ: "client-authentication+jwt"` instead of `typ: "JWT"`.
