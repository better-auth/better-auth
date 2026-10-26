---
"better-auth": patch
"@better-auth/core": patch
---

Concurrent `getAccessToken` and `refreshToken` calls for the same account now share one provider refresh, so providers that rotate single-use refresh tokens no longer reject the second call. The refreshed tokens are only stored while the account still holds the refresh token that was spent; when another worker or a re-link stored newer tokens first, those are returned instead of being overwritten.
