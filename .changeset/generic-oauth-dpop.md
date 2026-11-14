---
"better-auth": minor
---

Generic OAuth providers can request DPoP-bound tokens (RFC 9449) with the new `dpop: { keyPair }` option. Better Auth then sends `dpop_jkt` with the authorization request, signs DPoP proofs for the code exchange, token refresh, pushed authorization requests, and userinfo request, and retries once when the provider asks for a nonce.
