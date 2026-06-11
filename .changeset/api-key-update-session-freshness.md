---
"@better-auth/api-key": patch
---

Updating an API key now fails when the caller's session has been revoked server-side, instead of succeeding within the cookie-cache window.
