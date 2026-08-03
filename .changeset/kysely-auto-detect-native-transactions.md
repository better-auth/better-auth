---
"@better-auth/kysely-adapter": minor
---

Raw database instances (better-sqlite3, `node:sqlite`, `bun:sqlite`, `mysql2`, `pg`) passed directly as `database` now get native adapter transactions automatically, matching the behavior of the explicit `{ db }`/`{ dialect }` config shapes. This unblocks plugins that require native transactions (such as `@better-auth/scim`) when the database is provided in the quickstart `database: new Database(...)` shape.

Cloudflare D1 still reports no native transaction support, since D1 has no interactive transactions.
