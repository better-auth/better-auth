---
"better-auth": patch
---

`revokeOtherSessions` now revokes the other sessions in one batch through `internalAdapter.deleteSessions`, so its query count no longer grows with the number of sessions.

In `deleteSessions`, which the multi-session plugin also uses, a `session.delete.before` hook that returns `false` now keeps only that session instead of cancelling the whole batch, and a kept session also stays in secondary storage. When sessions live only in secondary storage, there are no database rows or hooks, and the cached sessions are removed as before.
