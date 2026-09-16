---
"@better-auth/core": minor
"better-auth": minor
---

Sign-out now returns a `FAILED_TO_DELETE_SESSION` error when the server-side session cannot be removed, while still clearing local session cookies.
