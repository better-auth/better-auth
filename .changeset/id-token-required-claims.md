---
"@better-auth/core": patch
---

A custom Facebook `getUserInfo` no longer receives client-submitted access tokens issued to another Facebook app, and ID tokens missing `exp` or `iat` are now rejected.
