---
"better-auth": patch
---

Expire the caller's session cookies when `revokeSession` revokes the current session and when `revokeSessions` revokes all sessions, so a revoked session cannot keep validating from the `session_data` cookie cache until it expires.
