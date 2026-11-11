---
"@better-auth/prisma-adapter": patch
---

Fix Prisma adapter updates that compare a unique field with `null` failing with a Prisma validation error. An update without a unique value in its `where` now changes only the first matching row, not every match; use `updateMany` to change all of them.
