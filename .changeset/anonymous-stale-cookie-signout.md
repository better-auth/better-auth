---
"better-auth": patch
---

With the `anonymous` plugin enabled, signing in or signing up while the browser still holds a revoked or expired session cookie no longer signs the user straight back out. It also no longer leaves the user in a live previous session when there's no database or secondary storage, where the cookie cache refreshes by default, and that session's cache is due for a refresh.
