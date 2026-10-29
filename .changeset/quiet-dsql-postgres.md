---
"@better-auth/core": patch
"@better-auth/kysely-adapter": patch
"better-auth": patch
---

Add opt-in Aurora DSQL support to the built-in Kysely PostgreSQL adapter, including asynchronous index migrations, numeric identity columns, and bounded retries of serialization aborts.

Keep sign-up verification email and session cookies after commit so aborted attempts cannot publish them, and preserve serialization aborts for transaction retries.
