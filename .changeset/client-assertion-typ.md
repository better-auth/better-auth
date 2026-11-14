---
"@better-auth/core": minor
---

Client assertions signed for the issuer audience, with `createPrivateKeyJwtClientAssertionGetter({ audience: "issuer" })`, now carry the JWT type `client-authentication+jwt`, as RFC 10070 recommends. Assertions for the token endpoint audience keep the type `JWT`.
