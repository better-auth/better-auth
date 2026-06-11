---
"better-auth": patch
---

Accepting a team invitation now checks the team's member limit before adding the member, inside a transaction. Previously the member was created first and the count compared afterward, so a team one slot below its limit wrongly rejected the member that should have fit and left an orphaned membership row; concurrent accepts could also exceed the limit.
