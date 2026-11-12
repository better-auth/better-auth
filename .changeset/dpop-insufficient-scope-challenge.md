---
"@better-auth/oauth-provider": patch
"@better-auth/mcp": patch
---

Answer a DPoP request whose token lacks a required scope with a `DPoP` challenge. Before, the `insufficient_scope` 403 always carried a `Bearer` challenge, even when the client sent a valid DPoP-bound token and proof. The `DPoP` challenge keeps `error="insufficient_scope"` and the missing scopes in `scope`, so the client can still authorize again for them. This applies when `createResourceServerChallenge` receives the failed `request`, which the resource client's `verifyAccessTokenRequest`, `requireMcpAuth`, and `createMcpProtectedRequestHandler` pass automatically, including for an `insufficient_scope` error thrown by an MCP tool handler.
