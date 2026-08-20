---
"@better-auth/oauth-provider": patch
---

Fix a crash on startup when a resource is configured without `allowedScopes` and the Prisma adapter is used. Seeding wrote a null the adapter cannot store in a scalar list column, so init failed before the resource row existed. A resource with no allowlist now stores an empty list and still accepts every requested scope.
