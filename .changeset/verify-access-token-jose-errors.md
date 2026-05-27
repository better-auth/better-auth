---
"@better-auth/core": patch
---

`verifyAccessToken` now returns unauthorized API errors for invalid token-shape verification failures, including missing JWT key IDs, while preserving raw JOSE errors for JWKS infrastructure failures.
