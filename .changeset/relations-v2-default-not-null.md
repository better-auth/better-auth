---
"@better-auth/drizzle-adapter": patch
---

The relations-v2 Drizzle schema generator now treats fields that omit `required` as `NOT NULL`, matching Better Auth migrations and the CLI generator.
