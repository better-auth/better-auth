---
"better-auth": patch
"@better-auth/core": patch
---

Single-use verification flows no longer hang on database adapters that use a one-connection pool. This fixes magic-link verification and similar token checks in connection-limited serverless database setups.
