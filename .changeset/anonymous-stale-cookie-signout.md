---
"better-auth": patch
---

With the `anonymous` plugin enabled, signing in or signing up while the browser still holds a revoked or expired session cookie no longer signs the user straight back out, and the previous session's leftover cookies are still cleared. Without a database or secondary storage, signing in while the previous session's cookie cache is due for a refresh also no longer leaves the user in that previous session.
