---
"better-auth": patch
---

`auth.api.getAccessToken()`, `auth.api.accountInfo()` and `auth.api.refreshToken()` now keep the original provider or database error as `error.cause` when a token refresh fails, so server code can tell a transient provider failure (5xx, network error) from a rejected refresh token. The HTTP response is unchanged.
