---
"better-auth": patch
"@better-auth/core": patch
---

Deleting a user no longer reports success while the user is still there, or leaves the user without its sessions and accounts when the delete fails partway. Where the database supports transactions, the session, account and user deletes run in one transaction: a failed delete rolls all of them back, and a `delete.before` hook that vetoes any of them keeps the user, its accounts and its sessions. Adapters with `transaction: false` cannot roll back, so deletes that ran before a failure or veto stay applied. A failed read before a delete now fails the request instead of skipping the delete or its `delete.before` hooks. `internalAdapter.deleteUser` now returns `true` once the user is deleted and `false` when nothing was deleted, and `/delete-user`, `/delete-user/callback` and `admin.removeUser` answer `FAILED_TO_DELETE_USER` instead of reporting success and signing the user out. Cached sessions in secondary storage are revoked even when a `delete.after` hook throws, including sessions created while the delete was running.
