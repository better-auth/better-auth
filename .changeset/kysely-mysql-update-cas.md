---
"@better-auth/core": patch
"@better-auth/kysely-adapter": patch
"@better-auth/prisma-adapter": patch
"@better-auth/test-utils": patch
---

`adapter.update` now returns `null` when no row matches or when it is called without a predicate. Use `updateMany` for intentional bulk updates.

The Kysely MySQL adapter no longer returns a row after a guarded update misses. Updates with an `id` guard also return the targeted row when `id` is not the first predicate. Keep MySQL rows-matched semantics enabled, which mysql2 does by default through `FOUND_ROWS`; disabling it can make idempotent updates look like misses.

The Prisma adapter now returns `null` when an update guard excludes the targeted row instead of surfacing Prisma's not-found exception. The shared adapter test suite now asserts the same fail-closed update behavior for adapter implementations.
