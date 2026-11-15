---
"@better-auth/core": minor
"better-auth": minor
---

`createPrivateKeyJwtClientAssertionGetter` now signs client assertions for the authorization server's issuer by default when it knows the issuer, as RFC 10070 §4 requires. Generic OAuth passes the issuer from the provider's discovery document, and also passes it to custom `getClientAssertion` functions as `issuer`. The `okta` and `microsoftEntraId` helpers withhold it, so they keep signing for the token endpoint URL that those providers document.

Without a known issuer, the getter still signs for the token endpoint URL. For a server that accepts only its token endpoint URL, set `audience: "token_endpoint"`. With `audience: "issuer"`, a request without a known issuer fails instead of falling back to the token endpoint.

Assertions signed for the issuer now carry the JOSE header `typ: "client-authentication+jwt"` instead of `typ: "JWT"`. Assertions signed for the token endpoint URL keep `typ: "JWT"`, because the explicit type signals the issuer-only audience and some authorization servers enforce that audience when they see it. `signPrivateKeyJwtClientAssertion` takes a new `issuer` option for this choice, and uses the explicit type only when `audience` equals it.
