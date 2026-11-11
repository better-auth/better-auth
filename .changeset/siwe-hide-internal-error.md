---
"better-auth": patch
---

SIWE verification no longer includes the internal error message (for example a database error) in its 401 response. The original error is now logged on the server instead.
