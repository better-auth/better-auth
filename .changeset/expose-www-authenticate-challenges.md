---
"@better-auth/oauth-provider": patch
"@better-auth/mcp": patch
---

Browser clients on another origin can now read resource-server and MCP `WWW-Authenticate` challenges. `createResourceServerChallenge`, and the resource client and MCP helpers built on it, now send `Access-Control-Expose-Headers: WWW-Authenticate` with every Bearer, `insufficient_scope`, and `DPoP` challenge. If your CORS layer sets its own `Access-Control-Expose-Headers`, include `WWW-Authenticate` in it.
