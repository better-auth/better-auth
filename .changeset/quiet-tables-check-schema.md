---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/kysely-adapter": patch
"auth": patch
---

Report missing tables, missing columns, and required columns Better Auth never writes during initialization, with guidance for fixing them. Kysely checks the live database schema. Authentication requests await the same check and are rejected if the schema does not match.

Validation is enabled by default, including in production. Set `advanced.database.validateSchema: false` to disable runtime validation. `auth migrate` refuses to apply changes when required unwritten columns need manual repair.
