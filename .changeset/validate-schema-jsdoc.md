---
"@better-auth/core": patch
---

The `advanced.database.validateSchema` JSDoc now says validation runs when the auth instance is first used, and that adapters other than Kysely, Drizzle, and Prisma skip it with a log message.
