---
"better-auth": patch
---

Resolve the session from the authoritative store in `/update-session`, and stop reissuing a session when the update fails. The endpoint now authenticates with `sensitiveSessionMiddleware` (cookie cache disabled), so a session whose backing row was revoked or deleted is no longer accepted from the signed cookie cache. If `internalAdapter.updateSession` returns `null` (the row was revoked or deleted concurrently), it no longer synthesizes a replacement session from cached state and reissues a cookie — it clears the session cookies and returns `UNAUTHORIZED`.
