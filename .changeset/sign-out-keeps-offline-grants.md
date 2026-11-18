---
"@better-auth/oauth-provider": patch
---

Fixed a client losing its `offline_access` grants on other devices when it used a refresh token after the user signed out. Sign-out revoked the session's refresh tokens that lack `offline_access`, and presenting one of them later was treated as a replayed refresh token, which revokes every refresh token the client holds for that user. Sign-out now deletes those refresh tokens instead, and a token that an earlier sign-out already revoked is rejected without touching other grants. The request fails with `invalid_grant`.
