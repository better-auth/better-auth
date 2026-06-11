---
"@better-auth/prisma-adapter": patch
---

A `delete` that fails for any reason other than the record already being absent now surfaces the error instead of silently reporting success.
