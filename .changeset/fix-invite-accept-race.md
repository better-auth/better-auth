---
"better-auth": patch
"@better-auth/kysely-adapter": patch
---

Fix organization invitation acceptance retries so concurrent accepts converge on one member and accepted invitations can be replayed safely. Direct SQLite/MySQL/Postgres Kysely databases now use real adapter transactions where supported, and SQLite update/delete mutations no longer report stale insert IDs.
