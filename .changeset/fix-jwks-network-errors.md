---
"@better-auth/core": patch
---

If your resource server verifies access tokens with `verifyAccessTokenRequest` or `verifyBearerToken` and a `jwksUrl`, including through the MCP plugin, a key set that cannot be reached at all, for example a refused connection, now throws an error. Before, the token was rejected as invalid with 401 "no token payload", which hid the outage. A key set that answers with an HTTP error already threw.

With `remoteVerify` configured, such a failure no longer falls back to remote introspection.

The OAuth provider's `/oauth2/introspect`, `/oauth2/userinfo` and `/oauth2/revoke` behave the same way with the JWT plugin's `jwks.remoteUrl`: they return 500 instead of reporting the token as invalid.
