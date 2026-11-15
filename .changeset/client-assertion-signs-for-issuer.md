---
"@better-auth/core": minor
"better-auth": minor
---

`createPrivateKeyJwtClientAssertionGetter` now signs client assertions for the authorization server's issuer by default when it knows the issuer, as RFC 10070 §4 requires. Generic OAuth passes the issuer from the provider's discovery document, and also passes it to custom `getClientAssertion` functions as `issuer`. The `okta` and `microsoftEntraId` helpers withhold it, so they keep signing for the token endpoint URL that those providers document.

Without a known issuer, the getter still signs for the token endpoint URL. For a server that accepts only its token endpoint URL, set `audience: "token_endpoint"`. With `audience: "issuer"`, a request without a known issuer fails instead of falling back to the token endpoint.

An assertion now carries the JOSE header `typ: "client-authentication+jwt"` only when its audience is the known issuer. Every other assertion, such as one signed for a token endpoint URL that is not the issuer or one signed without a known issuer, keeps `typ: "JWT"`, because the explicit type signals the issuer-only audience and some authorization servers enforce that audience when they see it. `signPrivateKeyJwtClientAssertion` takes a new `issuer` option, the known issuer, for this choice.
