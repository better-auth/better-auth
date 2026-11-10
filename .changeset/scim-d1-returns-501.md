---
"@better-auth/scim": patch
---

Apps that use the SCIM plugin with a database adapter that has no native transactions, such as Cloudflare D1, now start. Before, `betterAuth()` threw during startup when the SCIM plugin was enabled, so sign-in, sessions, and every other auth route failed.

SCIM still needs native transactions. On these adapters, Better Auth logs an error at startup. Every SCIM user and group request returns 501 Not Implemented, whether it arrives over HTTP at `/scim/v2` or as a server call through `auth.api`. Every server call that changes a SCIM connection also returns 501. Server calls that read SCIM connections keep working. Apps whose adapter has native transactions are unaffected.
