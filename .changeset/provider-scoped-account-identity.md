---
"@better-auth/core": patch
"@better-auth/sso": patch
"better-auth": patch
---

Add an opt-in provider-scoped account identity strategy for applications migrating from Better Auth 1.6. The guided migration and 1.7 runtime can now keep external accounts keyed by their existing `providerId` and `accountId` semantics while retaining the required issuer column and compound identity index.
