---
"@better-auth/memory-adapter": patch
---

Memory adapter transactions are now isolated. A transaction that throws no longer restores the whole database, so it can no longer erase rows written by other operations running at the same time. A singular `update` or `delete` called with an empty filter is now a no-op instead of changing every row, and `updateMany` returns the number of affected rows.
