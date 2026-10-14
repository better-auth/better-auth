---
"better-auth": patch
---

Preserve the referenced model and field keys when generating Kysely migrations, so custom table names that match another model key produce the intended foreign keys.
