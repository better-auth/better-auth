---
"auth": patch
---

`auth generate` now gives a missing Prisma back-relation the same `@relation` name as the foreign-key side, so a schema with a named relation such as `@relation("UserSessions", fields: [userId], references: [id])` passes `prisma validate` instead of failing with P1012.

When several relations to the same model share the foreign key and more than one lacks a back-relation, `auth generate` now stops and asks you to add the back-relations instead of guessing which name to use.
