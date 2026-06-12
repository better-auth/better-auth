---
"auth": patch
---

Prisma schema generation now updates existing numeric fields when `bigint` changes, so regenerating after switching between `bigint: true` and `bigint: false` emits the correct `BigInt` or `Int` type.
