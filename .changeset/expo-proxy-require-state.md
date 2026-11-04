---
"@better-auth/expo": patch
---

When OAuth state is stored in a cookie, Expo social sign-in now rejects authorization URLs without a `state` parameter, the same as with the default database storage.
