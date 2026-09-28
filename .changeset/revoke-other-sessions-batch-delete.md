---
"better-auth": patch
---

`revokeOtherSessions` now revokes the other sessions with one lookup and one delete instead of a lookup and a delete per session.

It goes through `internalAdapter.deleteSessions`, which now treats each token the way `deleteSession` does: a `session.delete.before` hook that returns `false` keeps only that session instead of cancelling the whole batch, and with secondary storage a session's cache entry and its `active-sessions` list entry are removed only once its database row is actually deleted. The multi-session plugin uses `deleteSessions` too, so its sign-out and session-limit cleanup get the same behavior.
