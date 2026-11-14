---
"@better-auth/core": minor
"@better-auth/sso": patch
---

`validateAuthorizationCode`, `refreshAccessToken`, `clientCredentialsToken`, and `pushAuthorizationRequest` accept an `issuer` and pass it to client assertion getters, so a getter created with `createPrivateKeyJwtClientAssertionGetter({ audience: "issuer" })` can sign for it. The Microsoft Entra ID provider passes its tenant's issuer when `tenantId` names a specific tenant. The SSO plugin passes the provider's configured issuer with its code exchange.
