---
"@better-auth/oauth-provider": minor
---

Claim callbacks and `customTokenResponseFields` now receive `grantId`, which identifies one authorization and stays the same across refresh-token rotation.

Two sign-ins under one stored consent share a `referenceId`, so apps that keep per-authorization state, such as data released once, could not tell them apart. `customAccessTokenClaims`, `customIdTokenClaims`, `customTokenResponseFields`, and the `extensions[].claims` contributors receive the same `grantId` at issuance, and opaque-token introspection passes it again when it re-derives access-token claims. `customUserInfoClaims` and the UserInfo contributor receive the presented access token's `grantId`; a JWT access token carries one only when `revocableJwtAccessTokens` is on. Issuances with no authorization code and no refresh token, such as client credentials, receive `undefined`.
