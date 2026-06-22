---
"@better-auth/kysely-adapter": patch
"@better-auth/prisma-adapter": patch
"@better-auth/test-utils": patch
---

Kysely adapter MySQL `update` now returns `null` when the guarded UPDATE matches zero rows, the same way SQLite/Postgres/MSSQL `RETURNING`/`OUTPUT` paths do.

Previously, the MySQL `withReturning` path re-SELECTed the updated row by `where[0].field` alone, silently dropping every predicate past the first and returning the row even when the UPDATE matched nothing. Any caller building a compare-and-swap on top of `adapter.update` (for example `WHERE id = ? AND revoked IS NULL`) failed open on MySQL only. `incrementOne` already had a transaction-locked MySQL implementation and was unaffected; it remains the recommended portable primitive for guarded single-row transitions.

The MySQL gate (matching the existing `incrementOne`/`updateMany` paths) relies on the driver reporting "rows matched" semantics in `numUpdatedRows`. `mysql2` enables this by default through the `CLIENT_FOUND_ROWS` client flag — keep that flag on. The `KyselyAdapterConfig.type` JSDoc and the MySQL adapter docs now call out the requirement, since disabling it surfaces idempotent updates as `null`.

Two related foot-guns in `adapter.update` are also hardened on the Kysely adapter:

- `update` now returns `null` on every dialect when called with `where: []`, instead of silently mutating every row. Use `updateMany` for bulk updates.
- The MySQL re-SELECT now prefers a unique `id` from anywhere in the `where` array (or from `values`), so guard orderings like `where: [{ field: "revoked", value: null }, { field: "id", value: X }]` resolve to the row the UPDATE actually wrote. The `id` lookup is restricted to safe equality guards (`operator` undefined or `"eq"`, `connector` not `"OR"`), so predicates like `{ field: "id", operator: "ne", value: X }` no longer hijack the re-SELECT and return a row the UPDATE intentionally excluded. If no safe `id` is in scope, the re-SELECT still falls back to `where[0]`; callers should ensure that field is unique, or use `incrementOne` for transaction-locked CAS.

The Prisma adapter `update` now returns `null` when a guarded predicate excludes the targeted row. `prisma.model.update` requires a `WhereUniqueInput` and raises `P2025` when extra non-unique predicates filter the row out (e.g. a CAS like `WHERE id = ? AND revoked IS NULL` losing the race). Previously that exception propagated to the caller; now the adapter converts it the same way `incrementOne` and `delete` already do, so every adapter agrees on the "guarded update matched no row" signal.
