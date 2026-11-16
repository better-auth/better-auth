---
"@better-auth/oauth-provider": patch
"@better-auth/mcp": patch
---

The OAuth provider and `requireMcpAuth` no longer cache keys returned by a custom JWT plugin `adapter.getJwks`, so keys it returns for one tenant or request can no longer verify a token presented in another. They now call it on every verification; cache inside the store if reads are expensive. The built-in database store is still cached.
