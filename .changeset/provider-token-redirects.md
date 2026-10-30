---
"@better-auth/core": patch
---

Built-in social providers no longer follow HTTP redirects on token exchange, refresh, verification, and signing key (JWKS) requests, matching the other server-side OAuth requests.
