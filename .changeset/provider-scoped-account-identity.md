---
"@better-auth/core": patch
"@better-auth/sso": patch
"better-auth": patch
---

Add an explicit `"provider-id"` compatibility strategy for populated Better Auth 1.6 migrations. `providerId` remains the configured connection, `accountId` remains the provider subject, and the required `issuer` field stores either the verified authority under the default `"issuer"` strategy or a deterministic provider namespace under `"provider-id"`; both strategies retain the unique `(issuer, accountId)` index.
