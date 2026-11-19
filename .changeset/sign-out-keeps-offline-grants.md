---
"@better-auth/oauth-provider": patch
---

Fixed a client losing its `offline_access` grants on other devices when it used a refresh token after the user signed out. Sign-out revoked the session's refresh tokens that lack `offline_access`, and presenting one of them later was treated as a replayed refresh token, which revokes every refresh token the client holds for that user. Such a token is now rejected because its session has ended, before the replay check runs, so the client's other grants stay valid. The request still fails with `invalid_grant`.
