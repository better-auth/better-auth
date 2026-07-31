---
"@better-auth/mcp": major
"better-auth": minor
"@better-auth/oauth-provider": minor
---

The MCP plugin moves out of `better-auth` into its own package, `@better-auth/mcp`, built on `@better-auth/oauth-provider`. Import the authorization plugin and protected-request helpers from the package root. The in-core MCP client (`createMcpAuthClient` and its adapters) is removed; MCP protocol and transport clients come from the official version 2 `@modelcontextprotocol/client` and `@modelcontextprotocol/server` packages. The OAuth endpoints move from `/mcp/*` to `/oauth2/*`, with discovery at `/.well-known/oauth-authorization-server` and protected resource metadata at `/.well-known/oauth-protected-resource`. Discovery-based MCP clients pick up the new locations on their own.

The shared-auth route helper is renamed from `withMcpAuth` to `requireMcpAuth`. The standalone protected-resource factory is renamed from `mcpHandler` to `createMcpProtectedRequestHandler`; pass one flat `McpProtectedRequestHandlerOptions` object with `issuer`, a single `audience`, optional `jwtVerifyOptions`, token-verification fields, and challenge fields. Its callback receives `accessTokenClaims`. `requireMcpAuth` verifies the access token against the published JWKS, validates DPoP proofs for DPoP-bound tokens, and passes the verified access-token claims to your handler.

`createInsufficientScopeError` now validates a custom description against the RFC 6750 `error_description` character set when the error is constructed. Invalid descriptions throw `TypeError("invalid error_description")` before an error can reach resource-challenge serialization.

MCP 2026-07-28 uses a stateless request and response transport. Serve MCP routes with version 2 of `@modelcontextprotocol/server`, configure `createMcpHandler` with `legacy: "reject"`, wrap it with `requireMcpAuth`, and export only `POST`. Remove MCP-route `GET` and `DELETE` exports and session-store options such as `redisUrl`. OAuth clients, consent, authorization codes, refresh tokens, and security records remain durable authorization state.

To migrate, install `@better-auth/mcp`, `@better-auth/cimd`, and the official version 2 MCP client or server package needed by your application; add the `jwt()` plugin, which is now required for token signing; and move options that were nested under `oidcConfig` to flat options on `mcp({ ... })`. The database models change: `oauthApplication` becomes `oauthClient`, with new `oauthRefreshToken` and `oauthClientAssertion` tables. Regenerate or migrate your schema with `npx auth migrate` or `npx auth generate`.
