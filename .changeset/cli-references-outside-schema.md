---
"auth": patch
"@better-auth/drizzle-adapter": patch
---

`auth generate` now names the field when a reference points to a model outside the Better Auth schema, instead of failing with only `Model "roles" not found in schema`. The Drizzle relations v2 generator no longer adds foreign keys to tables declared with `disableMigration: true`.
