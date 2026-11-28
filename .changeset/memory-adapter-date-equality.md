---
"@better-auth/memory-adapter": patch
---

The memory adapter now matches a date field against an equal `Date` in `eq`, `ne`, `in` and `not_in` queries, as the SQL and MongoDB adapters do. Before, dates were compared as objects, so `eq` and `in` found no rows and `ne` and `not_in` returned every row unless the query reused the stored `Date` object.
