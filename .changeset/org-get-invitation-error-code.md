---
"better-auth": patch
---

Fixed `organization.getInvitation` returning a missing, expired, or non-pending invitation error without a `code`. It now returns `INVITATION_NOT_FOUND` like the other invitation endpoints.
