---
"@better-auth/prisma-adapter": patch
---

Use `updateMany` in `incrementOne` for optimistic concurrency guards to prevent spurious P2025 error logs when collision guards fail.
