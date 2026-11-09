---
"@better-auth/core": patch
---

`getAccessToken` and `refreshToken` now fail when a provider refuses a token refresh with a 200 status, as GitHub does, instead of returning the expired access token.
