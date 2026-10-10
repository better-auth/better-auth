---
"@better-auth/kysely-adapter": patch
---

Allow concurrent D1 queries on a shared auth instance with Kysely 0.29, avoiding cross-request I/O errors.
