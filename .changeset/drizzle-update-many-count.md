---
"@better-auth/drizzle-adapter": patch
---

`updateMany` now returns the number of affected rows instead of the raw driver result, matching the adapter contract.
