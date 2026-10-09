---
"better-auth": patch
---

Projects using the organization plugin with `skipLibCheck: false` no longer get `TS2536: Type '"role"' cannot be used to index type ...` from `crud-members.d.mts`. The `role` returned by `getActiveMemberRole` is now typed as the organization's role names directly. Projects with `skipLibCheck: true` (the default in most templates) were unaffected.
