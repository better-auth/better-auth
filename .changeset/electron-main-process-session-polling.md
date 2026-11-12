---
"@better-auth/electron": patch
---

`sessionOptions.refetchInterval` polls `/get-session` again in the Electron main process after `setupMain()`, so idle desktop apps keep their session fresh and see revocations.
