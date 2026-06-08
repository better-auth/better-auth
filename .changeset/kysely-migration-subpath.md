---
"better-auth": patch
---

Restore Kysely 0.28 and 0.29 compatibility for SQLite dialect introspection. The dialects now mirror Kysely's stable migration table names locally, avoiding strict ESM build failures in Turbopack without forcing consumers onto Kysely 0.29.
