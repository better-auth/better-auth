---
"@better-auth/api-key": patch
---

Verifying the same API key from several requests at once can no longer drive its remaining-uses count below zero or let it exceed its rate limit. Secondary-storage-only deployments (without `fallbackToDatabase`) remain best-effort for these counters.
