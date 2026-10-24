---
"@better-auth/memory-adapter": patch
---

`ne null` where clauses no longer match records where the field was never set, matching how `eq null` already treats those records and how the other adapters behave.
