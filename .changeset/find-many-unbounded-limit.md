---
"@better-auth/core": minor
"@better-auth/drizzle-adapter": minor
"@better-auth/kysely-adapter": minor
"@better-auth/memory-adapter": minor
"@better-auth/mongo-adapter": minor
"@better-auth/prisma-adapter": minor
---

`findMany({ limit: null })` now returns every matching row. First-party adapters omit the query cap (`supportsUnboundedFindMany`). Custom adapters without that flag still receive a numeric `limit` (`count` then `findMany({ limit: total })`) and TypeScript still types that `limit` as required. Omitting `limit` still defaults to 100 (`advanced.database.defaultFindManyLimit`).
