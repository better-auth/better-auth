---
"@better-auth/core": minor
"better-auth": minor
---

Sign-out now returns a `FAILED_TO_DELETE_SESSION` error and keeps local session cookies available for retry when the server-side session cannot be removed.
