---
"@better-auth/drizzle-adapter": patch
"auth": patch
---

Use the Drizzle adapter's `enumFields` option to map a `model.field` key to an exported `pgEnum` when generating a PostgreSQL schema.
