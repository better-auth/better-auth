---
"better-auth": patch
---

Deleting a user no longer reports success while the user row is still there, or leaves the user without its sessions and accounts when the delete fails partway. The session, account and user deletes now run in one transaction where the database supports it: a failed delete rolls all of them back, and a `delete.before` hook that vetoes any of them keeps the user, its accounts and its sessions. A failed read before a delete fails the request instead of skipping the delete or its `delete.before` hooks, and cached sessions in secondary storage are revoked even when a `delete.after` hook throws.
