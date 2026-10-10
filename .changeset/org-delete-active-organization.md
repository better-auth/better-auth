---
"better-auth": patch
---

Keep the session's active organization intact when an organization delete does not go through, so a `beforeDeleteOrganization` hook that rejects the request no longer leaves the session without an active organization while that organization still exists.
