---
"@better-auth/oauth-provider": minor
"@better-auth/mcp": minor
---

Answer insufficient-scope failures with an RFC 6750 `403` `insufficient_scope` `WWW-Authenticate` challenge, per the MCP 2026-07-28 scope-challenge guidance. `requireMcpAuth` and `mcpHandler` accept a `scopes` option enforced against the token's `scope` claim, and handler-thrown `FORBIDDEN` errors produce the same step-up challenge.
