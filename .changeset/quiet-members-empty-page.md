---
"better-auth": patch
---

Skip the user lookup in organization `listMembers` when no members match, so an empty page no longer builds an `IN ()` query that MSSQL rejects.
