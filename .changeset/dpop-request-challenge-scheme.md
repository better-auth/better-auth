---
"@better-auth/oauth-provider": patch
"@better-auth/mcp": patch
---

Answer a failed request that used the `DPoP` authorization scheme with a `DPoP` challenge. Before, an expired, revoked, or otherwise invalid DPoP-bound token got a `Bearer` challenge, which a client that supports only DPoP might not act on. `createResourceServerChallenge` accepts a new `request` option, either the failed `Request` or `{ authorizationHeader }`, and reads the scheme from it. The resource client's `verifyAccessTokenRequest`, `requireMcpAuth`, and `createMcpProtectedRequestHandler` pass it automatically.
