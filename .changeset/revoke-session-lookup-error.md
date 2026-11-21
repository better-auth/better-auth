---
"better-auth": patch
---

`revokeSession` and other single-row deletes no longer report success when the database lookup before the delete fails. The error now surfaces instead of the row being left in place silently.
