---
"@better-auth/core": patch
---

Fix misleading errors for invalid runtime-provided AsyncLocalStorage values in the edge and browser fallback, and recognize AsyncLocalStorage initialized after importing Better Auth but before first use.
