---
"@better-auth/core": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/prisma-adapter": patch
"auth": patch
---

Validate Drizzle schema objects and generated Prisma client models during initialization, including in production, and report mismatches with guidance for fixing them. These checks do not query the database and cannot detect unapplied migrations.

For Prisma clients whose model metadata omits nullability, `auth generate` reports required fields that Better Auth never writes by reading the existing Prisma schema. Set `advanced.database.validateSchema: false` to disable runtime validation.
