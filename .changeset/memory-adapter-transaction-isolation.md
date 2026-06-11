---
"@better-auth/memory-adapter": patch
---

A failed transaction on the memory adapter no longer discards writes made by other operations running at the same time. A singular `update` or `delete` called with an empty filter is now a no-op instead of changing every row, and `updateMany` returns the number of rows it affected.
