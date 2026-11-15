---
"@better-auth/oauth-provider": minor
---

Revoking a grant now also stops a token request for that grant that is still issuing tokens. This covers reusing an authorization code while its first redemption is in progress, and reusing or revoking a refresh token while the grant is being refreshed. The in-flight request fails with `invalid_grant` and deletes the tokens it stored, where before its refresh token could survive the revocation.

When the client a code was issued to sends two overlapping redemptions of it, and both pass the client, PKCE, and DPoP proof checks, the second is a reuse and revokes the grant. The first now fails too, unless it finished issuing before the revocation started. In that case, the revocation revokes its tokens as for any reuse: its refresh tokens and opaque access tokens are deleted, and its JWT access tokens stay valid until they expire unless `revocableJwtAccessTokens` is on.

Every setup now writes one verification row for each revoked grant, which `databaseHooks.verification` sees, and each code redemption and refresh reads it. Before, these rows were written only with `revocableJwtAccessTokens`. The check needs a verification store that reads its own writes, so a lagging read replica can let an in-flight request keep its tokens.
