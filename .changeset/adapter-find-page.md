---
"@better-auth/core": minor
"better-auth": minor
---

Adapter `findPage` returns one page of rows plus the matching total. Factory-wrapped adapters get it without custom-adapter changes. It runs `findMany` and `count` with the same `where`, and omitted `limit` still defaults to 100 (`advanced.database.defaultFindManyLimit`).
