---
"@better-auth/kysely-adapter": patch
"@better-auth/test-utils": patch
---

Kysely adapter MySQL `update` now returns `null` when the guarded UPDATE matches zero rows, the same way SQLite/Postgres/MSSQL `RETURNING`/`OUTPUT` paths do.

Previously, the MySQL `withReturning` path re-SELECTed the updated row by `where[0].field` alone, silently dropping every predicate past the first and returning the row even when the UPDATE matched nothing. Any caller building a compare-and-swap on top of `adapter.update` (for example `WHERE id = ? AND revoked IS NULL`) failed open on MySQL only. `incrementOne` already had a transaction-locked MySQL implementation and was unaffected; it remains the recommended portable primitive for guarded single-row transitions.
