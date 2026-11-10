---
"@better-auth/core": minor
"@better-auth/oauth-provider": minor
"@better-auth/mcp": minor
---

The OAuth provider can require server-provided DPoP nonces (RFC 9449 §8 and §9). A nonce stops a client from using DPoP proofs it signed ahead of time. Set `dpop: { nonce: { required: true } }` on `oauthProvider()` or `mcp()`. The token and UserInfo endpoints then answer a proof without a current nonce with `use_dpop_nonce` and a fresh nonce in the `DPoP-Nonce` header. Successful DPoP responses carry the next nonce. The token endpoint checks the nonce before it redeems a code or refresh token, so the client's retry still succeeds. Nonces are derived from the auth secret and are not stored, so any instance that shares the secret accepts them.

Resource servers can require nonces too. Pass `dpop: { nonce: { required: true, secret } }` to `verifyAccessTokenRequest`, answer failures with `createResourceServerChallenge`, and send the next nonce with `createDpopNonce({ secret })` from `better-auth/oauth2`. Responses the library builds with a nonce are marked `Cache-Control: no-store`; mark your own nonce-bearing responses the same way. `requireMcpAuth` and the resource client created with your auth instance default to the auth secret and the provider's nonce lifetime.
