---
"@better-auth/api-key": patch
---

Resolve the session from the authoritative store when creating an API key, rather than the signed cookie-cache snapshot. `/api-key/create` now fetches the session with `disableCookieCache: true`, so a session that was revoked — including the session deletion performed when a user is banned — is no longer accepted within the cookie-cache window. Server-side calls that pass `userId` in the body are unaffected.
