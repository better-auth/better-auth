---
"better-auth": patch
---

A remembered sign-in or sign-up now refreshes its session like any other remembered session, even if an earlier sign-in in the same browser used `rememberMe: false`. Previously the earlier choice stayed in a `dont_remember` cookie until the browser closed, so the new session stopped sliding and expired `expiresIn` after it was created.
