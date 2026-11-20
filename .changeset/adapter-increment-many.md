---
"@better-auth/core": patch
"better-auth": patch
"@better-auth/kysely-adapter": patch
"@better-auth/drizzle-adapter": patch
"@better-auth/memory-adapter": patch
---

Add `incrementMany`, a batch of `incrementOne` with a per-row `where` keyed by `id`. Guard misses omit that row instead of throwing.
