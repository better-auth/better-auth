---
"better-auth": patch
"@better-auth/core": patch
---

Fix two buggy `internalAdapter` helpers.

Remove `findAccount(accountId)`. It looked accounts up by account ID alone, which is unique neither across providers nor across users, so it returned a non-deterministic match. All callers now use a user-scoped or provider-scoped lookup.

Replace the ambiguous `deleteSessions(string | string[])` with two explicit methods. `deleteUserSessions(userId)` revokes every session for a user, and `deleteSessions(tokens)` revokes sessions by token. The old single-string overload silently treated its argument as a user ID, so a caller that meant to delete one session token could instead wipe all of a user's sessions or quietly match nothing.
