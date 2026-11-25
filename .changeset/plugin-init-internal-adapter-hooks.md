---
"better-auth": patch
---

The internal adapter a plugin receives in `init` now runs the database hooks that plugins register. Before, records it created skipped those hooks. For example, a user created through it had no `role` from `admin()`'s `defaultRole`.
