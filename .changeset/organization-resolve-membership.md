---
"better-auth": minor
---

The organization plugin has a new `resolveMembership` option that sets the membership used for the signed-in user in an organization. Apps can let platform admins act in organizations they don't belong to, or refuse access to a member, without writing to the member table.
