---
"@better-auth/core": patch
---

`verifyAccessToken` now returns unauthorized API errors for invalid JWT verification failures instead of surfacing raw JOSE errors.
