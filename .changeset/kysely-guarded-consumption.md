---
"@better-auth/kysely-adapter": patch
---

Kysely `consumeOne` now rejects a row if a concurrent write makes the original condition false. Previously, it could delete that row after waiting for the concurrent write. Consumption remains limited to one row.
