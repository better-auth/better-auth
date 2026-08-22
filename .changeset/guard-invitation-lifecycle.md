---
"better-auth": patch
---

Guard invitation reject and cancel transitions atomically, safely renew expired
pending invitations, and add an ID-bound `resendInvitation` endpoint that uses
compare-and-swap lifecycle semantics.
