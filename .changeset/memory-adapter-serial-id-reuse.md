---
"@better-auth/memory-adapter": patch
---

With `generateId: "serial"`, the memory adapter no longer gives a new row the id of a row that is still stored. It used the row count as the next id, which collides after a delete.
