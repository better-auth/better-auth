---
"@better-auth/oauth-provider": patch
---

Fix `/oauth2/userinfo`, `/oauth2/introspect` and `/oauth2/revoke` returning an empty 500 for JWT access tokens that fail verification, such as an `alg: none` token, a tampered signature, an unknown `kid` or a wrong issuer. These tokens are now checked as opaque tokens and, when not found, get the same response as any unknown token: userinfo answers 401 `invalid_token` and introspection reports `{ "active": false }`. Key set failures still surface as server errors.

If you set `disableJwtPlugin: true`, these endpoints no longer try to verify JWT-shaped tokens, such as ID tokens, as JWT access tokens. Such tokens now get the unknown-token response instead of a 500.
