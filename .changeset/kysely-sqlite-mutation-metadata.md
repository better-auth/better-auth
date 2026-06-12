---
"@better-auth/kysely-adapter": patch
---

SQLite mutations through the Bun and Node drivers now report the number of affected rows and the inserted row id, so writes are no longer seen as affecting zero rows. The Bun driver also binds multiple query parameters correctly. `consumeOne` now works on SQL Server, which has no `LIMIT` clause.
