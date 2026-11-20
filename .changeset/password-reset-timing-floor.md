---
"better-auth": patch
---

`/request-password-reset` no longer reveals whether an address has an account through its response time. Without an `advanced.backgroundTasks.handler`, the reset email was awaited only for existing users, so unknown addresses answered noticeably faster. Both branches now share the same 500 ms floor already used by `/send-verification-email`. When a background task handler is configured the send is off the response path and no floor is added.
