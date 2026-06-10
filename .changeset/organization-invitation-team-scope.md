---
"better-auth": patch
---

Scope organization invitation team IDs to the invited organization. `createInvitation` now validates that every requested `teamId` belongs to the invitation's organization regardless of whether `teams.maximumMembersPerTeam` is set, and `acceptInvitation` re-checks each stored team's organization before adding team membership. Previously, with the default unlimited team size, a team ID from another organization could be stored on an invitation and applied on acceptance.
