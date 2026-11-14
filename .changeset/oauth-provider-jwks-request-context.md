---
"@better-auth/oauth-provider": patch
"@better-auth/mcp": patch
---

A custom JWT plugin `adapter.getJwks` again receives the request being verified when the OAuth provider reads signing keys for introspection, revocation, or end-session, and when `requireMcpAuth` verifies a token. Since 1.7.25 it received only the auth context, without `request` or `headers`, so a key store that picks keys by the request's host or headers found none.
