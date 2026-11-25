---
"better-auth": patch
"@better-auth/core": patch
---

When secondary storage fails, Better Auth logs and rethrows the error without the keys and values it was called with, so session tokens and cached sessions no longer reach application logs. The error keeps its name, message, and properties, such as the Redis command name, except where they contain one of those keys or values.
