---
"better-auth": minor
---

Team capacity now uses a durable `team.memberCount` counter and an internal unique `teamMember.membershipKey` so `maximumMembersPerTeam` is enforced atomically across invitation acceptance, direct team-member adds, and add-member-with-team calls. Previously the team limit relied on count-then-create checks that could admit multiple concurrent members into one remaining slot.
