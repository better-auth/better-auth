---
"better-auth": patch
---

Fixes revoked sessions still being accepted by `getAccessToken`, `refreshToken`, `accountInfo`, and the delete-account callback when the session cookie cache is enabled and a plugin or hook resolved the session earlier in the same request. These routes now perform an authoritative session read, so a session revoked server-side can no longer mint provider access tokens or complete an account deletion before the cached cookie expires.
