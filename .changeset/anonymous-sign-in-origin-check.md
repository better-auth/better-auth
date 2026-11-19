---
"better-auth": patch
---

Validate the request origin on `/sign-in/anonymous`, the same way the other sign-in endpoints do. A browser request from an origin outside `trustedOrigins` now gets a 403.
