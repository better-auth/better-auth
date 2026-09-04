---
"better-auth": minor
"@better-auth/core": minor
"auth": minor
"@better-auth/drizzle-adapter": minor
"@better-auth/prisma-adapter": minor
---

Validate the database schema against the Better Auth configuration and report every problem at once, with the change that fixes it, instead of failing on the first insert. Missing tables and columns, and required columns Better Auth never writes, throw for the core tables and warn for tables a plugin contributes. Drizzle and Prisma adapters check their schema definition when `betterAuth()` is called; the built-in database runs one introspection query before the first database call. `auth migrate` and `auth generate` report the same problems. Disable with `advanced.database.validateSchema: false`.
