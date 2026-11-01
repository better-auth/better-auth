---
"better-auth": patch
---

Organization invitations created with a role list such as `"member, admin"` now store each role without the surrounding spaces, so the invited member receives every listed role instead of silently losing the ones after the first comma.
