---
"@better-auth/prisma-adapter": patch
---

The Prisma adapter with `provider: "mongodb"` now matches `contains`, `starts_with`, and `ends_with` filters, and every case-insensitive filter, as literal text. Before, regex characters in the value acted as patterns: an admin `listUsers` search for `.` with `searchOperator: "contains"` returned every user, a `deleteMany` with `starts_with: ".*"` deleted every row, and a case-insensitive lookup for `a.c@example.com` also matched `abc@example.com`. Other providers are unaffected.
