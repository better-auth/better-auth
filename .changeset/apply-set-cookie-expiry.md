---
"better-auth": patch
---

Ensure `applySetCookies` removes cookies expired by `Max-Age` or `Expires` when merging `Set-Cookie` headers.
