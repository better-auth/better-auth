---
"@better-auth/core": minor
"better-auth": minor
"@better-auth/mongo-adapter": patch
---

Adapter `findPage` returns one page of rows plus the matching total. Factory-wrapped adapters get it without custom-adapter changes. Hand-written `DBAdapter` objects and mocks need a `findPage` method to type-check. It runs `findMany` and `count` with the same `where` (together unless `supportsConcurrentReads` is `false`). Omitting `limit` still defaults to 100 (`advanced.database.defaultFindManyLimit`). MongoDB transaction adapters disable concurrent reads because a session cannot overlap operations.
