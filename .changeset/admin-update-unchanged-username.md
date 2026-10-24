---
"better-auth": patch
---

Admin `updateUser` no longer rejects a user's unchanged username as already taken when the username plugin is enabled. Assigning the acting admin's username to another user now returns `USERNAME_IS_ALREADY_TAKEN` instead of a database error.
