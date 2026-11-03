---
"@better-auth/kysely-adapter": patch
---

On MySQL with `generateId: "serial"`, resolve the created row from the id reported by the INSERT itself instead of re-reading `LAST_INSERT_ID()` on a separate connection, and fail instead of guessing when no auto-increment id is reported.
