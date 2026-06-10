---
"@better-auth/prisma-adapter": patch
---

Unexpected errors during `delete` now surface instead of being silently logged and swallowed. Only a missing record is treated as a successful no-op.
