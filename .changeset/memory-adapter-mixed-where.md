---
"@better-auth/memory-adapter": patch
---

Fixed the memory adapter matching extra rows when a `where` mixes `AND` and `OR` conditions. Queries, updates, and deletes now apply `(AND conditions) AND (OR conditions)`, the same as the other adapters.
