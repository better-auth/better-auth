---
"better-auth": patch
"@better-auth/core": patch
---

Added `session.maxPerUser` to cap a user's active sessions, revoking the oldest ones when a new session would exceed the limit. Impersonation sessions from the admin plugin don't count toward the limit.
