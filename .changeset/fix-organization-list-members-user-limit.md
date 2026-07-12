---
"better-auth": patch
---

Fix `organization.listMembers` failing with "User not found for member" for orgs with more than ~100 members by applying the same membership limit to the users query.
