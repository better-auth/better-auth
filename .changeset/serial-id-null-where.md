---
"@better-auth/core": patch
---

With `advanced.database.generateId: "serial"`, filtering an `id` or reference field with `null` now compares it with `null`. Before, the `null` became `0`, so `eq null` matched no row and, on the memory adapter, `ne null` also matched rows where the field was unset.
