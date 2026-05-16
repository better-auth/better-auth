---
"better-auth": minor
"@better-auth/core": minor
"@better-auth/oauth-provider": minor
"@better-auth/sso": minor
---

Add client authentication configuration for token endpoint requests across the stack, including `private_key_jwt` (RFC 7523).

Generic OAuth providers now accept `tokenEndpointAuth` for token endpoint client authentication. Use `tokenEndpointAuth: { method: "private_key_jwt", getClientAssertion }` for JWT client assertions, `{ method: "none" }` for public clients, and `{ method: "client_secret_basic" }` or `{ method: "client_secret_post" }` with `clientSecret` for explicit secret-based client authentication. The existing `authentication: "basic" | "post"` option remains available for secret-based token requests.

Use `createPrivateKeyJwtClientAssertionGetter()` to sign RFC 7523 assertions from a private key. The assertion getter receives `{ clientId, tokenEndpoint, grantType }`, so integrations do not duplicate client ID or token endpoint values inside assertion helpers. Core OAuth2 now exports private-key JWT-specific helpers and types: `signPrivateKeyJwtClientAssertion`, `createPrivateKeyJwtClientAssertionGetter`, `PrivateKeyJwtSigningAlgorithm`, and `PRIVATE_KEY_JWT_SIGNING_ALGORITHMS`.

Token endpoint client authentication parameters are derived from `clientId`, `clientSecret`, and `tokenEndpointAuth`. Custom token parameters are for provider-specific fields and do not replace the configured client authentication values.

`refreshAccessToken()` now forwards `resource` values to refresh-token requests, so RFC 8707 resource indicators work through both the high-level refresh helper and `refreshAccessTokenRequest()`.

The synchronous OAuth2 request builders `createAuthorizationCodeRequest`, `createRefreshAccessTokenRequest`, and `createClientCredentialsTokenRequest` have been removed. Use the async `authorizationCodeRequest`, `refreshAccessTokenRequest`, and `clientCredentialsTokenRequest` helpers instead.

Servers verify JWT client assertions signed with asymmetric keys, and clients can use the same token endpoint authentication contract for authorization code, refresh, and client credentials token requests.
