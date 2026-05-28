---
"auth": minor
---

Add MSSQL support to the Drizzle schema generator (`npx better-auth generate` for projects using `provider: "mssql"`). Emits `mssqlTable` schemas with appropriate column types: `varchar` (with bounded length for indexed/unique/sortable strings, `length: "max"` otherwise), `bit` for booleans, `int`/`bigint` for numbers, `datetime2({ precision: 3 })` for dates, and `varchar({ length: "max", mode: "json" })` for arrays/json. `int().identity()` is used for serial-id primary keys. `SYSUTCDATETIME()` is emitted for `defaultNow`-style date defaults since MSSQL drizzle has no `.defaultNow()` helper.

Requires `drizzle-orm@^1.0.0-rc` at runtime in the consuming project (where `mssql-core` and `node-mssql` live).
