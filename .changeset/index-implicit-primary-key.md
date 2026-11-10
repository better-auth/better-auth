---
"@better-auth/core": patch
"better-auth": patch
"auth": patch
"@better-auth/drizzle-adapter": patch
---

Allow table-level indexes to reference the implicit primary key `id`, so plugins can declare compound indexes such as `["organizationId", "id"]` without redeclaring `id`; MySQL and SQL Server index length limits now account for the `id` column's real type and size.
