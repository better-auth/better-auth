---
"better-auth": patch
"@better-auth/core": patch
---

Deleting a user no longer reports success while the user is still there, or leaves the user without its sessions and accounts when the delete fails partway. The session, account and user deletes run in one transaction where the database supports it, and a failed read before a delete now fails the request instead of skipping the delete or its `delete.before` hooks. When a `delete.before` hook vetoes any of them, everything is kept: `internalAdapter.deleteUser` now returns `false` (and `true` once the user is deleted), and `/delete-user`, `/delete-user/callback` and `admin.removeUser` answer `FAILED_TO_DELETE_USER` instead of reporting success and signing the user out. Cached sessions in secondary storage are revoked even when a `delete.after` hook throws, including sessions created while the delete was running.
