---
"auth": patch
---

`auth generate` now gives a missing Prisma back-relation the same `@relation` name as the foreign-key side, so a schema with a named relation such as `@relation("UserSessions", fields: [userId], references: [id])` passes `prisma validate` instead of failing with P1012.
