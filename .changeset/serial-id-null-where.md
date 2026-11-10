---
"@better-auth/core": patch
---

With `advanced.database.generateId: "serial"`, a query that compares an `id` or reference field such as `refreshId` with `null` now compares it with `null`. Before, the `null` became `0`, so `eq null` matched no row and, on the memory adapter, `ne null` also matched rows whose field was unset.
