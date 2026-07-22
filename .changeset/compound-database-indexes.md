---
"@better-auth/core": minor
"@better-auth/drizzle-adapter": minor
"@better-auth/mongo-adapter": minor
"auth": minor
"better-auth": minor
---

Plugin database schemas can now define named or generated table-level indexes across multiple fields. SQL migrations and generated Drizzle or Prisma schemas resolve configured table and column names consistently, while the MongoDB adapter creates the same indexes before the first index-enforcing write.
