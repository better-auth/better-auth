---
"@better-auth/api-key": patch
---

Fix API key verification overwriting concurrent changes with stale state. Verification now persists only the fields it mutates (rate-limit counters, remaining count, refill and request timestamps) instead of writing back the entire record it read, so a concurrent disable, permission change, or expiry update can no longer be reverted by an in-flight verification. In secondary-storage mode, the record is re-read and merged before writing, so a key deleted mid-verification is no longer recreated.
