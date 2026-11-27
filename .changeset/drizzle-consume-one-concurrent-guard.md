---
"@better-auth/drizzle-adapter": patch
---

Repeat the where guard on the outer `DELETE` in `consumeOne` so concurrent transactions in PostgreSQL under `READ COMMITTED` do not delete a row that was moved out of the guard (#12618).
