---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
---

Fix `getSession` failing with "Failed to get session" when a `user.additionalFields` entry references a table outside the Better Auth schema, including with database joins enabled on Drizzle and Prisma. Join resolution now matches `references.model` against schema keys only.
