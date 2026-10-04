---
"@better-auth/kysely-adapter": patch
---

Allow concurrent D1 queries on a shared auth instance with Kysely 0.29, avoiding cross-request I/O errors. Kysely migrations on D1 now take a lock row so concurrent runs apply each migration once.
