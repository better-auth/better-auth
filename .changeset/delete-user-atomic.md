---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/i18n": patch
---

Deleting a user no longer reports success when a database read fails, a `user.delete.before` hook vetoes the delete, or the database skips it without an error. These answer `FAILED_TO_DELETE_USER` and keep the user's sessions and accounts, on databases with transactions for the last case. `user.delete.before` now runs before the session and account deletes.
