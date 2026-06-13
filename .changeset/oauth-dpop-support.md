---
"better-auth": minor
"@better-auth/core": minor
"@better-auth/oauth-provider": minor
"@better-auth/mcp": minor
---

feat(oauth-provider)!: DPoP-bound access tokens (RFC 9449)

OAuth provider integrations can issue and verify DPoP sender-constrained tokens. Clients request them with `dpop_bound_access_tokens` at registration, `dpop_jkt` on the authorization request, or by targeting a resource configured with `dpopBoundAccessTokensRequired`. Issued tokens carry `cnf.jkt`, return `token_type: "DPoP"`, and stay bound through refresh-token rotation, introspection, and userinfo.

Resource servers verify DPoP requests with `verifyAccessTokenRequest`, which checks the `Authorization: DPoP` scheme, the proof key, the request target, the access-token hash, and proof replay. The MCP package advertises DPoP in protected resource metadata and verifies DPoP-bound requests. `requireMcpAuth` now rejects replayed proofs through your database adapter by default, so anti-replay holds across multiple instances; pass `dpop.replayStore` to use a different store.

Breaking: the raw-token verifier `verifyAccessToken` is renamed to `verifyBearerToken`, both in `better-auth/oauth2` and as the `oauthProviderResourceClient` action, and it rejects DPoP-bound tokens. Use `verifyAccessTokenRequest` on any endpoint that may receive them. The resource-request input type is renamed from `AccessTokenRequestInput` to `ResourceRequestInput`, and the DPoP algorithm option is `signingAlgorithms` everywhere.

Run a schema migration for the new `oauthDpopProof` replay table and the DPoP token-binding fields.
