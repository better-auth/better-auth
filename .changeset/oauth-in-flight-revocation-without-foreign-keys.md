---
"@better-auth/oauth-provider": patch
---

If you use the memory adapter, MongoDB, or another database that does not enforce foreign keys, a token request that was issuing a refresh token when a refresh token reuse or a replayed authorization code revoked its grant now fails with `invalid_grant`. Before, it returned an opaque access token that stayed valid until it expired, although the grant had been revoked. Refresh token reuse now also revokes every access token in the family, even when the family has more than 100 refresh tokens.

JWT access tokens, and opaque access tokens issued without a refresh token, still stay valid until they expire.
