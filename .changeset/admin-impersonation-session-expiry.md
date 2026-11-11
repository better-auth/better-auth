---
"better-auth": patch
---

Admin impersonation sessions now end after `impersonationSessionDuration` for all clients. Before, a request without the `dont_remember` cookie, such as a request from a bearer client, extended the session to the full `session.expiresIn`.
