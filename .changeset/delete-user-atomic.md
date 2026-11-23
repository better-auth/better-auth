---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/i18n": patch
---

Deleting a user no longer reports success when a database read fails, a `user.delete.before` hook vetoes the delete, or the database skips it without an error. A failed read now surfaces as an error. A veto or a skipped delete answers `FAILED_TO_DELETE_USER` and keeps the user's sessions and accounts, on databases with transactions for a skipped delete. `user.delete.before` now runs before the session and account deletes.
