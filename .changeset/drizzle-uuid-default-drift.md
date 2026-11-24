---
"auth": patch
"@better-auth/drizzle-adapter": patch
---

With `advanced.database.generateId: "uuid"` on PostgreSQL, `drizzle-kit push` no longer re-applies `ALTER COLUMN "id" SET DEFAULT` on every run. The generated Drizzle `id` default is now `gen_random_uuid()`, which matches what PostgreSQL reports for the column, instead of `pg_catalog.gen_random_uuid()`.
