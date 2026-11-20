---
"better-auth": patch
"@better-auth/core": patch
---

Deleting a user no longer reports success when a database read fails or a `user.delete.before` hook vetoes the delete. A veto now keeps the user's sessions and accounts and answers `FAILED_TO_DELETE_USER`, and `user.delete.before` runs before the session and account deletes. On databases with transactions a failed delete also keeps the sessions and accounts.
