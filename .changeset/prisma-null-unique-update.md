---
"@better-auth/prisma-adapter": patch
---

Fix Prisma adapter updates that compare a unique field with `null` failing with a Prisma validation error. Such an update now changes one matching row, not every match, and returns that row even when the update changes a filtered field or the id. Use `updateMany` to change all matching rows.
