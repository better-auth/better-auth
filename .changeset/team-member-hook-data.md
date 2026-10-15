---
"better-auth": patch
---

Apply the data returned from the organization plugin's `beforeAddTeamMember` hook to the created `teamMember` row, and allow `teamMember` to declare `schema.teamMember.additionalFields` like the plugin's other org-owned models.
