---
"@better-auth/core": patch
"@better-auth/mcp": patch
---

`requireMcpAuth` now resolves the authorization server's JWKS in-process through the JWT plugin instead of fetching `${baseURL}/jwks` over HTTP. This fixes MCP servers co-located with their authorization server returning 500 for every valid access token on runtimes that cannot request their own origin, such as Cloudflare Workers by default, and removes a needless self-request everywhere else. Resource-server verification options (`verifyBearerToken`, `verifyAccessTokenRequest`, `createMcpProtectedRequestHandler`) also accept a function JWKS source with an optional `jwksCacheKey` now.
