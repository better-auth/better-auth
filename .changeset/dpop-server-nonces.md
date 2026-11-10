---
"@better-auth/core": minor
"@better-auth/oauth-provider": minor
"@better-auth/mcp": minor
---

The OAuth provider can now require server-provided DPoP nonces (RFC 9449 §8 and §9), which stop a client from using DPoP proofs it signed ahead of time. Set `dpop: { nonce: { required: true } }` on `oauthProvider()` or `mcp()`. A DPoP proof sent to the token or UserInfo endpoint without a current nonce is then answered with `use_dpop_nonce` and a fresh nonce in the `DPoP-Nonce` header, and successful DPoP responses carry the next nonce. The token endpoint checks the nonce before it redeems an authorization code, device code, or refresh token, so the client's retry still succeeds, and it measures nonce freshness at the time the request arrives. Nonces are derived from the auth secret and are not stored, so they work across instances that share the secret.

Resource servers can require nonces too. Pass `dpop: { nonce: { required: true, secret } }` to `verifyAccessTokenRequest`, and send the next nonce on successful responses with `createDpopNonce({ secret })` from `better-auth/oauth2`. `createResourceServerChallenge` answers with a `WWW-Authenticate: DPoP error="use_dpop_nonce"` challenge and keeps the nonce in a separate `DPoP-Nonce` header beside it. Every response that carries a nonce is marked `Cache-Control: no-store`. `requireMcpAuth` and the resource client created with your auth instance accept `dpop.nonce` and use the auth secret and the provider's nonce lifetime by default, so the nonce from a token response works at an API that shares the auth secret.
