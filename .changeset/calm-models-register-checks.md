---
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
---

Check the Drizzle schema object and the generated Prisma client against the tables Better Auth writes before the first request outside production, and report every missing table, missing column, or required column Better Auth never fills together with its fix.
