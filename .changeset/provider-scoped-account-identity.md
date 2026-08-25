---
"@better-auth/core": patch
"@better-auth/sso": patch
"better-auth": patch
---

Add `account.identityStrategy: "provider-id"` as an explicit Better Auth 1.6 compatibility path. Every 1.7 account schema continues to require `issuer` and `accountId` with a unique compound index across them. The compatibility strategy stores a deterministic `local:oauth:<encoded providerId>` issuer namespace while preserving logical `(providerId, accountId)` account recognition. Better Auth 1.7.x continues to default an omitted strategy to issuer-scoped identity.
