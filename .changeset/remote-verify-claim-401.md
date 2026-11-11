---
"@better-auth/core": patch
---

Reject introspected access tokens that fail claim validation with a 401 `UNAUTHORIZED` error. When `remoteVerify` introspection reported an active token whose `aud`, `iss`, `exp`, or `nbf` claim did not pass the configured checks, `verifyBearerToken` and `verifyAccessTokenRequest` threw a plain `Error`, so resource servers answered with a 500 instead of a `WWW-Authenticate` challenge. Expired tokens now report `token expired` and other claim failures report `invalid access token`, matching local JWKS verification.
