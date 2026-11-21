---
"@better-auth/memory-adapter": patch
---

Mixed `AND`/`OR` `where` clauses on the memory adapter now match `(AND group) AND (OR group)`, so rows that only satisfy an `OR` clause are no longer returned.
