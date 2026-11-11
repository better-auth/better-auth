---
"@better-auth/oauth-provider": patch
---

Refresh tokens are issued correctly when `formatRefreshToken.encrypt` is async. Before, the client received `[object Promise]` in place of the token.
