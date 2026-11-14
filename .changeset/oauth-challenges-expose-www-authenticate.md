---
"@better-auth/oauth-provider": patch
---

Every 401 challenge from the OAuth provider now lists `WWW-Authenticate` in `Access-Control-Expose-Headers`, including client registration, initial access tokens, and token endpoint client authentication. A browser client on another origin, such as a browser MCP client that registers itself, can now read the challenge. Before, only UserInfo and resource challenges exposed it.
