---
"@better-auth/api-key": patch
---

API key verification claims usage quota and a rate-limit slot together, so rate-limited requests leave the remaining quota intact. Verification still uses the secondary-storage cache for key lookups and applies one guarded database write on the usual success path.
