---
"@better-auth/core": patch
---

Fixed a memory leak where the JWKS cache could grow on every access token verification.
