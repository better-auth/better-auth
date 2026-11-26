---
"better-auth": patch
"@better-auth/api-key": patch
"@better-auth/scim": patch
---

Admin user listing, organization member listing, API key listing, and SCIM collection reads now use adapter `findPage` instead of separate `findMany` and `count` calls.
