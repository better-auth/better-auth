---
"@better-auth/oauth-provider": patch
---

On databases that do not enforce foreign keys, such as the memory adapter and MongoDB, an opaque access token could stay valid after refresh token reuse or a replayed authorization code revoked its grant, if the token request was still issuing a refresh token. That request now fails with `invalid_grant`, and refresh token reuse revokes every access token in the family, even past 100 refresh tokens. JWT access tokens and opaque access tokens issued without a refresh token stay valid until they expire.
