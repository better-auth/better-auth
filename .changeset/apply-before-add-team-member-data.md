---
"better-auth": patch
---

Apply the `data` returned by the organization plugin's `beforeAddTeamMember` hook when creating the team membership, and allow extra columns on the `teamMember` model through `schema.teamMember.additionalFields`.
