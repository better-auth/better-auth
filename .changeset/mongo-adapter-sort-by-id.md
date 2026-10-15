---
"@better-auth/mongo-adapter": patch
---

If you use the MongoDB adapter, `findMany` calls that sort by `id` now return rows in id order. Previously the sort was silently ignored, so paging through results with `limit` and `offset` could repeat or skip rows.
