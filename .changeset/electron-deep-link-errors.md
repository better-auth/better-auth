---
"@better-auth/electron": patch
---

A deep link that fails to authenticate, such as one opened again after sign-in, is now logged instead of causing an unhandled promise rejection in the main process.
