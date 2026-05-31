---
"@better-auth/kysely-adapter": patch
---

`deleteMany` and `updateMany` now return the correct number of affected rows on the `bun:sqlite` and `node:sqlite` dialects, which previously always returned `0`.
