---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/kysely-adapter": patch
"@better-auth/memory-adapter": patch
"@better-auth/mongo-adapter": patch
"@better-auth/prisma-adapter": patch
---

`findAll` returns every matching row. Factory-wrapped adapters get it without custom-adapter changes. First-party adapters omit the query cap (`supportsUnboundedFindMany`). Custom adapters without that flag still receive a numeric `limit` (`count` then `findMany({ limit: total })`) and TypeScript still types that `limit` as required. Omitting `limit` on `findMany` still defaults to 100 (`advanced.database.defaultFindManyLimit`).
