---
"@better-auth/mcp": patch
"@better-auth/core": patch
---

Fix `requireMcpAuth` returning 500 in Cloudflare Workers by resolving JWKS in-process when co-located with auth.
