---
"@better-auth/oauth-provider": patch
"better-auth": patch
"@better-auth/core": patch
"@better-auth/mongo-adapter": patch
---

Refresh-token rotation and token revocation, two-factor backup-code regeneration, device-code claiming, and organization invitation acceptance now work on Prisma. Concurrent or repeat requests in these flows could previously return an error on Prisma instead of the expected result.

On MongoDB servers older than 5.0, these flows and other guarded value updates (rate-limit window resets, API-key refills) no longer fail with an empty-update error.

`@better-auth/core`: `incrementOne` now reports a clear error when called with no `increment` and no `set`.
