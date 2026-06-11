---
"better-auth": patch
---

Expired MCP access tokens are no longer accepted. A protected MCP resource now rejects a bearer token once it has expired, both on the server and through the remote client. A refresh token is accepted only when the original authorization included the `offline_access` scope.
