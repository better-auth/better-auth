---
"better-auth": patch
---

`oneTap({ disableSignUp: true })` was ignored and `/one-tap/callback` still created new users. It now closes sign-up, and `disableSignup` stays as a deprecated alias.
