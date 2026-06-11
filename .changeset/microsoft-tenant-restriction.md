---
"@better-auth/core": patch
---

Microsoft Entra ID sign-in now honors the configured tenant restriction. `tenantId: "organizations"` rejects personal Microsoft accounts, and `tenantId: "consumers"` rejects work and school accounts. Both were accepted before.
