---
"@better-auth/oauth-provider": minor
---

Replaying a rotated refresh token now revokes only that token's grant, not every refresh token the client holds for the user. It deletes the grant's refresh tokens and the opaque access tokens linked to them, and JWT access tokens stay valid until they expire unless `revocableJwtAccessTokens` revokes them. The user's other grants with the same client, including those a device code or a CIBA request started, keep working. A refresh token with no grant ID, such as one rotated before you upgrade, names no grant, so its replay still deletes every refresh token the client holds for the user, and a refresh still issuing tokens under it isn't stopped.
