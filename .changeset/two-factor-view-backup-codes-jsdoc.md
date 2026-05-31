---
"better-auth": patch
---

Document `viewBackupCodes` as a server-only function so its API comment no longer reads like an HTTP route.

The JSDoc above `auth.api.viewBackupCodes` advertised `POST /two-factor/view-backup-codes`, but the endpoint is server-only: it is not registered on the HTTP router and has no client method. The comment now states that it is callable only from trusted server code and that the `userId` should come from an authenticated session.
