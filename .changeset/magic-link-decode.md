---
"better-auth": patch
---

Stop double-decoding `callbackURL`, `newUserCallbackURL` and `errorCallbackURL` on magic link verify so percent-encoded characters in callback query params are preserved.
