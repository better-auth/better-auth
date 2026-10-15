---
"@better-auth/oauth-provider": patch
---

`/oauth2/userinfo`, `/oauth2/introspect` and `/oauth2/revoke` now answer a JWT that fails verification the way they answer any unknown token. Before, they returned an empty 500. This covers an `alg: none` token, a tampered signature, an unknown `kid` and a wrong issuer: userinfo returns 401 `invalid_token` with a `WWW-Authenticate` challenge, introspection returns `{ "active": false }`, and revocation returns its unknown-token error. Valid JWT and opaque access tokens are unaffected, including JWT-shaped tokens issued by `generateOpaqueAccessToken`.

If you set `disableJwtPlugin: true`, a JWT-shaped token that is not a stored access token, such as an ID token, now gets the same unknown-token response instead of a 500.

A key set the server cannot use, such as one where two keys share a `kid`, still returns 500.
