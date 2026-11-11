---
"better-auth": minor
"@better-auth/core": minor
---

Plugin authors can now reject a resolved session with the new `validateSession` plugin option. Better Auth calls it on every session lookup, including cookie-cache hits and endpoints that require a session, and before the multi-session, admin, one-time-token, and OAuth provider plugins reuse a stored session. A rejected session counts as signed out: it is not refreshed, its cookies are not re-issued, and signing out with it clears that browser's cookies without deleting the session. A plugin that looks up a session itself can call `isSessionAccepted` from `better-auth/api` before issuing that session's cookies.

Apps without a plugin that sets `validateSession` are unaffected.
