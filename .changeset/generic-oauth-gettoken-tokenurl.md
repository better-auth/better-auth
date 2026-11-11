---
"better-auth": patch
---

Passed the configured or discovered `tokenUrl` to a generic OAuth provider's custom `getToken`, so it no longer has to fetch the discovery document again to find the token endpoint.
