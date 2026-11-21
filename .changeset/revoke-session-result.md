---
"better-auth": patch
---

`/revoke-session` and `/admin/revoke-user-session` no longer report success when the session survives, such as when a `session.delete.before` hook vetoes the delete or the database read before the delete fails.
