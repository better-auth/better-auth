---
"auth": patch
---

With `advanced.database.generateId: "uuid"` on PostgreSQL, the generated Prisma schema no longer makes `prisma migrate dev` create a new migration on every run. The `id` default is now `dbgenerated("gen_random_uuid()")`, which matches what PostgreSQL reports for the column, instead of `dbgenerated("pg_catalog.gen_random_uuid()")`. Running `auth generate` on a schema written by an earlier version updates its `id` defaults as well.
