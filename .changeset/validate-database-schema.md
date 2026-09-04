---
"better-auth": minor
"@better-auth/core": minor
"auth": minor
"@better-auth/drizzle-adapter": minor
"@better-auth/prisma-adapter": minor
---

Validate the database schema against the Better Auth configuration and fail with the full list of problems instead of failing on the first insert. Missing tables and columns, and required columns Better Auth never writes, are reported with the change that fixes them. Drizzle and Prisma adapters check their schema definition when `betterAuth()` is called; the built-in database runs one introspection query before the first database call. `auth migrate` and `auth generate` report the same problems. Disable with `advanced.database.validateSchema: false`.
