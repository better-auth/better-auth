---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/kysely-adapter": patch
"@better-auth/memory-adapter": patch
"@better-auth/mongo-adapter": patch
"@better-auth/prisma-adapter": patch
---

`findMany({ limit: null })` now returns every matching row. First-party adapters omit the query cap (`supportsUnboundedFindMany`). Custom adapters without that flag still receive a numeric `limit` (`count` then `findMany({ limit: total })`) and TypeScript still types that `limit` as required. Omitting `limit` still defaults to 100 (`advanced.database.defaultFindManyLimit`).
