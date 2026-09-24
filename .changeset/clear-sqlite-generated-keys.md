---
"@better-auth/kysely-adapter": patch
---

Correctly detect database-generated SQLite primary keys during schema validation, including `INTEGER PRIMARY KEY` columns without `AUTOINCREMENT`.
