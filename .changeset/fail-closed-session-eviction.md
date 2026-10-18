---
"better-auth": patch
---

fix(session): fail closed when secondary-storage session eviction fails

`deleteUserSessions` and `deleteUser` now reject when a cached session could not be removed from secondary storage, instead of logging the failure and reporting success (#11326). Tokens that could not be evicted stay listed in the user's `active-sessions` index so a later revocation retries them.

Behavior change: callers can now receive a rejection on a secondary-storage `delete` failure, and because the eviction runs after the surrounding database work commits, that rejection cannot roll the committed work back. No new options, types or schema fields.
