---
"better-auth": patch
---

Deleting an organization clears the session's active organization only once the delete succeeds, so a `beforeDeleteOrganization` hook that rejects the delete no longer leaves the session pointing at nothing.
