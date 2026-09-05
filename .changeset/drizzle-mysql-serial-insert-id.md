---
"@better-auth/drizzle-adapter": patch
---

Fix `create` returning `null` on MySQL with `generateId: "serial"` when the driver does not keep one connection between queries (for example `@planetscale/database`). The adapter now reads the auto-increment id from the `INSERT` response instead of `LAST_INSERT_ID()`.
