---
"@better-auth/oauth-provider": patch
---

If you use the memory adapter, MongoDB, or another database that does not enforce foreign keys, a request that was still issuing tokens when a refresh token reuse or a replayed authorization code revoked its grant now fails with `invalid_grant`. Before, it returned an opaque access token that stayed valid until it expired, although the grant had been revoked.
