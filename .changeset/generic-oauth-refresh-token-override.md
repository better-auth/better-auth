---
"better-auth": minor
---

Add opt-in `refreshToken` override to `genericOAuth` provider config. Providers with non-standard refresh endpoints (JSON body, custom auth, or no `tokenUrl` because exchange goes through `getToken`) can now refresh without a standard token endpoint: the hook receives `(refreshToken, ctx?)` and runs instead of the form-encoded `tokenUrl` POST, with `accessTokenExpiresIn` still applied to its result as an expiry fallback. `refreshTokenParams` and `tokenEndpointAuth` do not apply on the custom path.
Custom `fetch` in the hook runs outside `fetchRefusingRedirects` (redirects are not refused) and without `BLOCKED_REFRESH_TOKEN_PARAMS` filtering — pin the URL, refuse redirects, and never log secrets.
