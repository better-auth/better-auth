---
"better-auth": patch
---

Fix forced UUID user IDs from create hooks being ignored on PostgreSQL adapters when `advanced.database.generateId` is set to `"uuid"`.
