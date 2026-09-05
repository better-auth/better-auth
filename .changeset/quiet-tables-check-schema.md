---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/kysely-adapter": patch
"auth": patch
---

Start schema validation during initialization in every environment and report missing tables, missing columns, and required unwritten columns with their fixes. Authentication requests share the same check and fail on a schema mismatch. Set `advanced.database.validateSchema: false` to disable runtime validation. `auth migrate` reports schema problems before changing anything.
