---
"better-auth": patch
---

add beforeRemoveUser and afterRemoveUser hooks to admin plugin

Expose lifecycle hooks in AdminOptions so app developers can inject
custom logic around user deletion via the admin removeUser endpoint.

- beforeRemoveUser: throw to abort deletion (e.g. sole-owner guard)
- afterRemoveUser: run post-deletion side effects

Adds four unit tests and updates the admin plugin docs.