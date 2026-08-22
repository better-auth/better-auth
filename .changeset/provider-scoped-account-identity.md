---
"@better-auth/core": patch
"@better-auth/sso": patch
"better-auth": patch
---

Add a provider-scoped account identity strategy for applications migrating from Better Auth 1.6. The guided migration now requires an explicit strategy when external accounts need an issuer backfill and recommends `"provider-id"`, which keeps their existing `providerId` and `accountId` semantics while retaining the required issuer column and compound identity index.
