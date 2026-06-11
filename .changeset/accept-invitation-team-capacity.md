---
"better-auth": patch
---

Accepting a team invitation now checks the team's member limit before adding the member and releases the invitation claim back to pending if the membership work fails. Previously the member was created first and the count compared afterward, so a team one slot below its limit wrongly rejected the member that should have fit and left an orphaned membership row. Full cross-adapter concurrent capacity enforcement still requires a durable per-team capacity lock/counter.
