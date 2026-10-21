---
"better-auth": patch
---

Cleared the don't-remember-me cookie when `stopImpersonating` restores the admin session. It was left behind by `impersonateUser`, so the next impersonation captured it as the admin's own preference and restored a session cookie without `max-age` — logging the admin out on browser restart and freezing session refresh.
