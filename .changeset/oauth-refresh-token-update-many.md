---
"@better-auth/oauth-provider": patch
---

Use `updateMany` for refresh-token rotation and revocation compare-and-swap checks so adapters that cannot return rows from compound `update` calls, including Prisma, can rotate refresh tokens correctly.
