---
"better-auth": patch
---

Adding a member to a team that is already at its `maximumMembersPerTeam` limit is now rejected on every path. `addMember` with a `teamId` and `add-team-member` previously skipped the limit that invitation acceptance enforced, so they could push a team over its cap. A rejected `addMember` no longer creates the organization member.
