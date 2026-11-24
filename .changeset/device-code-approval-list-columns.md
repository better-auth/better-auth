---
"@better-auth/oauth-provider": patch
---

Approving a device code through the consent page no longer fails with a server error on databases that reject `null` in list columns, such as Prisma with PostgreSQL or MongoDB, when no authentication methods are recorded.
