---
"better-auth": patch
---

fix(organization): allow passing id through `beforeCreateTeam` and `beforeCreateInvitation`

Mirrors #4765 for teams and invitations: `adapter.createTeam` and `adapter.createInvitation` now pass `forceAllowId: true`, so ids returned from the respective hooks survive the DB insert.
