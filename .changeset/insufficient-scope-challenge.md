---
"@better-auth/oauth-provider": minor
"@better-auth/core": minor
"@better-auth/mcp": minor
"better-auth": minor
---

MCP clients that hit a scope wall now learn exactly which scopes to ask for. A request whose access token is missing required scopes is answered with a `403` and an RFC 6750 `insufficient_scope` `WWW-Authenticate` challenge naming every missing scope at once, so the client can step up its authorization in one round-trip instead of one browser redirect per missing scope.

`requireMcpAuth` and `mcpHandler` accept a `scopes` option, enforced against the token's `scope` claim. Handlers that decide scopes per tool throw the new `insufficientScopeError(scopes, description?)` from `better-auth/oauth2` to raise the same challenge for scopes only they know about.

Permission denials are left alone. A plain `FORBIDDEN` stays a plain `403` with no challenge, since re-authorizing cannot grant access that scopes were never gating, and errors thrown by your route handler reach your framework's error handling unchanged.
