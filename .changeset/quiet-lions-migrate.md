---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
---

SQL migration tooling can now inspect and apply migrations through Drizzle and Prisma adapters. Migration queries share the adapter's configured dialect and transaction boundary, and schema inspection respects physical table and column names from Drizzle metadata and Prisma `@map` declarations.
