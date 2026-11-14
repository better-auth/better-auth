---
"@better-auth/core": minor
---

`validateAuthorizationCode`, `refreshAccessToken`, `clientCredentialsToken`, and `pushAuthorizationRequest` accept an `issuer` and pass it to client assertion getters, so a getter created with `createPrivateKeyJwtClientAssertionGetter({ audience: "issuer" })` can sign for it. The Microsoft Entra ID provider passes its tenant's issuer when `tenantId` names a specific tenant.
