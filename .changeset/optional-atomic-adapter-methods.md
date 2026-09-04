---
"@better-auth/core": patch
---

Make `consumeOne` and `incrementOne` optional on custom adapters again. When an adapter omits them, the factory falls back to `findOne` plus an id-guarded `deleteMany`, or a compare-and-swap `updateMany` loop, instead of throwing at request time.
