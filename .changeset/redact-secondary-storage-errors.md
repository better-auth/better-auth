---
"better-auth": patch
---

When secondary storage fails, Better Auth logs and rethrows the error without the keys and values it was called with, so session tokens and cached sessions no longer reach application logs. The error name, the rest of its message, and the Redis command name are kept.
