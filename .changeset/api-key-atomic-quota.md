---
"@better-auth/api-key": patch
---

API key usage quotas and per-key rate limits are now enforced with atomic guarded updates against the database row. Concurrent verifications of the same key can no longer drive `remaining` below zero or push `requestCount` past the configured maximum. Secondary-storage-only deployments (without `fallbackToDatabase`) keep a best-effort read-modify-write for these counters, since there is no database row to guard.
