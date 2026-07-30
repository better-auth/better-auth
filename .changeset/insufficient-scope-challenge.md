---
"@better-auth/oauth-provider": minor
"@better-auth/core": minor
"@better-auth/mcp": minor
"better-auth": minor
---

MCP clients that hit a scope wall now learn exactly which scopes to ask for. Missing protected scopes produce a `403` with an RFC 6750 `insufficient_scope` `WWW-Authenticate` challenge that names every missing scope. Clients can union those scopes into one authorization request instead of opening one browser redirect per scope.

- Configure protected scopes with `requiredScopes` through `RequireMcpAuthOptions` or the matching `createMcpProtectedRequestHandler` verifier option. Exact membership remains the default; `isScopeSatisfied` can define hierarchical policies.
- Use `createInsufficientScopeError` when an operation determines its required scopes dynamically. `createResourceServerChallenge` converts that signal and recognized token failures into safe RFC 6750 challenges.
- Use `challengeScopes` only as the unauthenticated challenge hint.

Handler-produced responses, ordinary permission denials, configuration failures, and unrelated thrown values keep their original status and identity.
