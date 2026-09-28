---
"better-auth": patch
---

`revokeOtherSessions` now deletes the other sessions in one batch instead of running a lookup and a delete for each session.
