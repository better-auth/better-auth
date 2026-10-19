---
"better-auth": patch
---

`auth.api.getSession()` now keeps the original database error as `error.cause` when the session lookup fails, so server code can tell a transient failure from a bug.
