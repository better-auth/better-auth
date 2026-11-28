---
"better-auth": patch
---

Fix a race condition in the organization plugin where concurrent `leaveOrganization`, `removeMember`, or `updateMemberRole` calls could simultaneously demote or remove all remaining owners, leaving the organization without an owner. Operations affecting organization members are now serialized per organization with in-process locks, and demoting the last owner to a non-creator role via `updateMemberRole` is consistently rejected.

Note: In multi-instance or horizontally scaled deployments, in-process locks guard against concurrency within each instance; multi-server durability requires distributed locking or database-level isolation.
