---
"@better-auth/oauth-provider": patch
---

Fix `/oauth2/userinfo`, `/oauth2/introspect` and `/oauth2/revoke` returning an empty 500 for JWT access tokens that fail verification, such as an `alg: none` token, a tampered signature or an unknown `kid`. Userinfo now answers 401 `invalid_token`, introspection reports `{ "active": false }` and revocation treats the token as invalid. Key set failures still surface as server errors.
