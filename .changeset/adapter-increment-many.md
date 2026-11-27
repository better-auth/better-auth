---
"@better-auth/core": minor
"better-auth": minor
"@better-auth/kysely-adapter": minor
"@better-auth/drizzle-adapter": minor
"@better-auth/memory-adapter": minor
---

Add `incrementMany`, a batch of `incrementOne` with a per-row `where` keyed by `id`. Guard misses omit that row instead of throwing.
