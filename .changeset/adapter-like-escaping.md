---
"@better-auth/kysely-adapter": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
"@better-auth/test-utils": patch
---

`contains`, `starts_with` and `ends_with` filters now match `%`, `_` and `\` literally in the Kysely adapter, the Drizzle adapter, and the Prisma adapter on PostgreSQL and MySQL, instead of treating them as SQL `LIKE` wildcards. For example, an admin user search for `a_b` no longer also matches `axb`. On MSSQL, the Kysely adapter also matches `[` literally.

The shared adapter test suite now asserts that these operators match LIKE wildcards literally. Prisma on SQLite cannot match them literally, because SQLite has no default LIKE escape character and Prisma cannot add an `ESCAPE` clause.
