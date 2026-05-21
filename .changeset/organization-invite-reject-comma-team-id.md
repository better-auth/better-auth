---
"better-auth": patch
---

Organization invitations no longer silently route an invitee to the wrong team when `advanced.database.generateId` returns team ids containing a comma. The invitation API now rejects such ids with an `INVALID_TEAM_ID` error.
