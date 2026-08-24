---
"@better-auth/core": patch
"@better-auth/sso": patch
"better-auth": patch
---

Preserve the Better Auth 1.6 `(providerId, accountId)` account identity by default. This compatibility path does not add or persist an issuer. Applications can opt into issuer-scoped identity with `account.identityStrategy: "issuer"`; the schema, runtime account lookup, and public types then use `(issuer, accountId)`.
