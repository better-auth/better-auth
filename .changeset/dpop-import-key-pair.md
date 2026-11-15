---
"@better-auth/core": minor
"better-auth": minor
---

`importDpopKeyPair` from `better-auth/oauth2/dpop-client` loads a DPoP key pair from a stored private JWK, so a CLI or server can sign proofs with the same key across restarts and instances. It accepts the key types `createDpopProof` signs with; an RSA JWK must set `alg` to `RS256` or `PS256`.
