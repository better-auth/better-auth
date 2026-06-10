---
"@better-auth/core": patch
---

Cryptographically verify PayPal ID tokens on direct sign-in. Previously `verifyIdToken` only decoded the JWT and checked that a `sub` claim was present, performing no signature, issuer, audience, or expiration checks, so any well-formed token paired with a valid access token would be accepted. The token is now verified against PayPal's issuer and published JWKS (RS256) or the client secret (HS256), with the `aud` pinned to the configured `clientId`, a `maxTokenAge` bound, and the `nonce` checked when supplied.
