---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
"auth": patch
---

Check the Drizzle schema object and the generated Prisma client against the tables Better Auth writes before the first request outside production, and report every missing table, missing column, or required column Better Auth never fills together with its fix. `auth generate` reports a required column an existing Prisma schema declares that Better Auth never fills.
