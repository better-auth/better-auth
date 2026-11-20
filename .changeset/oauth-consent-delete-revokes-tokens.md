---
"@better-auth/oauth-provider": minor
---

Deleting a consent now revokes the access and refresh tokens issued under it. Before, a client kept its tokens after the user removed the consent, and a refresh token renewed itself indefinitely. The revocation covers the consent's user, client, and reference, so the same user's tokens for the client under another reference stay valid, and it stops a refresh that is still issuing tokens, for a refresh token issued or refreshed since 1.8. JWT access tokens are revoked only with `revocableJwtAccessTokens`, and only when the grant has a refresh token. If the revocation fails, the consent stays so the user can delete it again.
