---
"@better-auth/core": patch
---

Stop writing the raw database error to `console.error` when a fallback join query fails. Query failures are still reported through the configured logger and rethrown, so SQL text and bound parameters no longer leak to stderr when the app routes Better Auth logs elsewhere.
