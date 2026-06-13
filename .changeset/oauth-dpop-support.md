---
"better-auth": minor
"@better-auth/core": minor
"@better-auth/oauth-provider": minor
"@better-auth/mcp": minor
---

OAuth provider integrations can now issue and verify DPoP-bound access tokens. Clients may request DPoP-bound tokens with `dpop_bound_access_tokens`, authorization requests may use `dpop_jkt`, and protected resources may require DPoP-bound access tokens.

Resource servers can verify DPoP-bound requests with `verifyAccessTokenRequest`, including the `Authorization: DPoP` scheme, proof key binding, request target, access-token hash, and replay protection. Request-less `verifyAccessToken` remains for raw bearer-token verification and rejects DPoP-bound access tokens.

The MCP package now advertises DPoP support in protected resource metadata and accepts DPoP-bound resource requests. Run a schema migration for the OAuth provider DPoP proof replay table and the new DPoP token binding fields.
