---
"better-auth": patch
---

fix: support fully cookie-only (stateless) deployments without database

When no database adapter is configured, the built-in memory adapter could produce malformed responses on re-login UPDATE paths. Additionally, providing a stateless adapter as a workaround caused `isStateful` to return `true`, which made `getAccessToken()` bypass the cookie cache and query the stateless adapter (returning `null` → 401).

Fixes:
1. `hasServerSessionStore` now detects custom adapter functions combined with explicit cookie-only configuration (both `storeAccountCookie` and `cookieCache.enabled`) and treats the deployment as stateless.
2. `handleOAuthUserInfo` skips the redundant `updateAccount` call when no real server-side session store exists, since the account data is already persisted in the JWE account cookie.

See https://github.com/better-auth/better-auth/issues/10392
