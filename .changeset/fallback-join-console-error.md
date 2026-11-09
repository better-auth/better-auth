---
"@better-auth/core": patch
---

Failed fallback join queries are now reported only through the configured logger, instead of also printing the raw database error (including SQL and bound values) with `console.error`.
