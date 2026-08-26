---
"@better-auth/core": patch
"@better-auth/sso": patch
"auth": patch
"better-auth": patch
---

The CLI now generates new Better Auth configurations with `account: { identityStrategy: "provider-id" }`. Configurations that omit `account.identityStrategy` remain compatible with Better Auth v1.7 by using issuer identity and emit a one-time warning with migration guidance. `providerId` remains the configured connection, `accountId` remains the provider subject, and the required `issuer` field stores either the verified authority under `"issuer"` or a deterministic provider namespace under `"provider-id"`; both strategies retain the unique `(issuer, accountId)` index.
