---
"better-auth": patch
"@better-auth/core": patch
---

Fix `revoke-other-sessions` silently leaving sessions un-revoked. It previously listed the user's sessions and deleted them individually, but `listSessions` is capped at the adapter's `defaultFindManyLimit` (100); a user with more sessions than that limit kept some un-revoked, and because expired sessions are never pruned the capped window could even be entirely expired rows - revoking nothing while still returning `{ status: true }`. It now deletes every other session in a single unbounded query (`internalAdapter.deleteUserSessions(userId, exceptSessionToken)`), which also clears the user's stale/expired session rows.
