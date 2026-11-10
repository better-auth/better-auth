---
"@better-auth/scim": patch
---

Apps that use the SCIM plugin with a database adapter that has no native transactions, such as Cloudflare D1, now start. Before, `betterAuth()` threw during startup when the SCIM plugin was enabled, so sign-in, sessions, and every other auth route failed.

SCIM still needs native transactions. On these adapters, Better Auth logs an error at startup. Every `/scim/v2` request, and every server call that changes a SCIM connection, returns 501 Not Implemented. Server calls that read SCIM connections keep working. Apps whose adapter has native transactions are unaffected.
