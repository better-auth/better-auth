---
"better-auth": patch
"@better-auth/core": patch
---

Concurrent `getAccessToken` and `refreshToken` calls for the same account in one process now share one provider refresh, so providers that rotate single-use refresh tokens no longer reject the second call. The refreshed tokens are only stored while the account still holds the refresh token that was spent; when another worker or a re-link stored newer tokens first, those are returned instead of being overwritten. When a call in another process is rejected with `invalid_grant` because its refresh token was just spent, it re-reads the account for up to 500 ms and returns the other worker's tokens once they are stored. If they are not stored in that time, the call still fails.
