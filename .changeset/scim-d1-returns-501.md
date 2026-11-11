---
"@better-auth/scim": patch
---

Apps that enable the SCIM plugin with a database adapter that has no native transactions, such as Cloudflare D1, now start. Before, `betterAuth()` threw at startup, so sign-in, sessions, and every other auth route failed.

SCIM itself still needs native transactions. On these adapters, Better Auth logs an error at startup and returns 501 Not Implemented for every `/scim/v2` request, over HTTP or through `auth.api`, and for server calls that change a SCIM connection. Server calls that read SCIM connections keep working. To provision users and groups with SCIM, use an adapter with native transactions. Apps whose adapter has native transactions are unaffected.
