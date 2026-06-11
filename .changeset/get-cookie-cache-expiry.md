---
"better-auth": patch
---

`getCookieCache` now returns `null` for an expired session instead of the stale session data. Middleware that calls it to gate access no longer treats an expired signed cookie as a live session.
