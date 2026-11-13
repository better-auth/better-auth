---
"@better-auth/oauth-provider": minor
---

With `revocableJwtAccessTokens`, revoking a refresh token now also revokes the JWT access tokens of its grant, including those issued before earlier rotations. The same happens when a rotated refresh token or an authorization code is replayed. With the option on, JWT access tokens issued with a refresh token carry the grant in a new `grant_id` claim, and each introspection, UserInfo, or `validateAccessToken` check of such a token looks up the grant as well as the token.
