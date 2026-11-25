---
"auth": patch
---

`auth generate` now gives a missing Prisma back-relation the same `@relation` name as the foreign-key side, so a schema with a named relation such as `@relation("UserSessions", fields: [userId], references: [id])` passes `prisma validate` instead of failing with P1012.

`auth generate` now stops with an error, instead of guessing or leaving the schema invalid, when it cannot add the back-relation safely: when several relations to the same model share the foreign key and more than one lacks a back-relation, or when the back-relation's default field name, such as `sessions`, is already taken. Add the back-relation yourself, then generate again.
