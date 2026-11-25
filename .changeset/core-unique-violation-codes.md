---
"@better-auth/core": patch
---

Database errors that carry a driver code other than a unique violation are no longer treated as unique violations when their message contains words such as "duplicate key". Device code creation now returns the original database error instead of retrying and failing with "Failed to generate a unique device code", and verification and client metadata document registration no longer fall back to an existing record for such errors. SQLite primary key collisions and MongoDB `11001` duplicate key errors are now recognized by their code, and a SQLite error with only the base constraint code, or a libSQL `PROXY_ERROR` for a write forwarded by a replica, is matched only by SQLite's "UNIQUE constraint failed" wording.
