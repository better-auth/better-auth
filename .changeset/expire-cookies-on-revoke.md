---
"better-auth": patch
---

Revoking your current session with `revokeSession` or `revokeSessions`, and deleting your account with `deleteUser({ token })`, now expire the session cookies, so a cached session is no longer returned afterwards.
