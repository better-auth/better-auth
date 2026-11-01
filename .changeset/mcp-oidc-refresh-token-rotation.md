---
"better-auth": patch
---

Rotate refresh tokens in the `mcp` and `oidcProvider` plugins: the refresh token presented to the token endpoint is spent once the new pair is issued, so presenting it again, or concurrently, returns `invalid_grant`. The access token issued alongside the spent refresh token stops working at the same time, and a client that loses the refresh response has to go through the authorization flow again.
