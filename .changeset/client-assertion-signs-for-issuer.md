---
"@better-auth/core": minor
"better-auth": minor
---

`createPrivateKeyJwtClientAssertionGetter` now signs client assertions for the authorization server's issuer by default when it knows the issuer, as RFC 10070 §4 requires. Generic OAuth passes the issuer from the provider's discovery document. Without a known issuer, the getter still signs for the token endpoint URL. For a server that accepts only its token endpoint URL, set `audience: "token_endpoint"`.

Assertions from `createPrivateKeyJwtClientAssertionGetter` and `signPrivateKeyJwtClientAssertion` now carry the JOSE header `typ: "client-authentication+jwt"` instead of `typ: "JWT"`.
