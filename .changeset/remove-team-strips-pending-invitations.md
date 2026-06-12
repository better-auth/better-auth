---
"better-auth": patch
---

Deleting a team no longer breaks its pending invitations. The removed team is dropped from those invitations, which stay valid for their remaining teams or as plain organization-level invitations. Accepting an invitation that still references a missing team fails without consuming the invitation.
