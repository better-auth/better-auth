---
"@better-auth/oauth-provider": minor
---

`/oauth2/revoke` and `/oauth2/introspect` now follow RFC 7009 and RFC 7662 when they look up the presented token. Check your clients and tests for these changes:

- `/oauth2/revoke` returns `200` for an unknown, expired, or already revoked token. Before, it returned `400 invalid_request`, including for a second revoke of the same refresh token and for a revoke that raced a refresh.
- A token sent with the wrong `token_type_hint` is found. Before, `/oauth2/revoke` returned `400` and left the token active, and `/oauth2/introspect` reported `{ "active": false }` for a valid token.
- Revoking a token issued to a different client returns `400 invalid_request` when the caller is a confidential client. Before, it returned `200` without revoking anything. A public client still gets `200`, and the token stays valid.
- A JWT-shaped token that fails verification (for example `alg: none`, a forged signature, or an unknown `kid`) is treated as an invalid token: `200` from revoke, `{ "active": false }` from introspect, and `401 invalid_token` from userinfo. Before, all three returned `500`.
- At `/oauth2/token`, a refresh token without the configured `prefix.refreshToken` now gets `400 invalid_grant`, like any other unknown refresh token. Before, it got `400 invalid_token`.
- In an extension grant handler, `provider.validateAccessToken` returns `{ active: false }` for an unknown token instead of throwing. `provider.requireActiveAccessToken` still throws.

A valid JWT access token still returns `400 unsupported_token_type` from revoke, and failed client authentication still returns `401`.
