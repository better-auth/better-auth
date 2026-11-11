---
"@better-auth/prisma-adapter": patch
---

Prisma adapter updates that compare a unique field with `null` no longer fail with a Prisma validation error. Any `update` whose `where` has no unique equality match, including these, now changes one matching row instead of every match, and returns that row even when the update changes a filtered field or the `id`. Use `updateMany` to change every matching row.
