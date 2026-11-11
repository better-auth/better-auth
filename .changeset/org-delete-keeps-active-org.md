---
"better-auth": patch
---

Fixed `deleteOrganization` clearing the session's active organization when a `beforeDeleteOrganization` hook rejected the delete. The active organization is now cleared only after the organization is actually deleted.
