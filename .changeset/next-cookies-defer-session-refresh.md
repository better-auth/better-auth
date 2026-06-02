---
"better-auth": minor
---

`nextCookies()` now auto-enables `deferSessionRefresh`, so reading the session in a React Server Component no longer triggers redundant database writes or drifts the session's expiry on each navigation. Apps that read the session only on the server can opt out with `session: { deferSessionRefresh: false }`.
