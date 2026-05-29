---
"@better-auth/core": patch
"better-auth": patch
---

Refresh access tokens from `genericOAuth` providers that omit `expires_in`.

When a provider's token response leaves out `expires_in`, Better Auth recorded no expiry, so `getAccessToken` couldn't tell the token had lapsed and never refreshed it; callers kept receiving a stale token. Set `accessTokenExpiresIn` (seconds) on a `genericOAuth` config entry to declare the token's lifetime; the expiry is then synthesized at sign-in and on refresh, and the existing refresh path works. The option is opt-in: providers that return `expires_in` or issue non-expiring tokens are unaffected.
