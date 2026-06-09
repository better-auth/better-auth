---
"better-auth": patch
---

Document that `ctx.context.newSession` is `null` while a two-factor challenge is in flight. When a 2FA-enabled user signs in through a credential endpoint, the pending session is discarded and `newSession` is reset to `null` (no authenticated session exists until the second factor is verified). Server-side `after` hooks reading `ctx.context.newSession` must null-check it before accessing `newSession.user`. This clarifies the behavior change introduced in #9639.
