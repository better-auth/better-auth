---
"@better-auth/scim": patch
---

SCIM bearer tokens are now compared in constant time during request authentication, closing a timing side channel that could help an attacker recover a valid token. This applies to every storage mode: plain, hashed, encrypted, and custom.
