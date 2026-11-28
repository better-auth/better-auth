---
"@better-auth/api-key": patch
---

API key verifications rejected by the rate limit no longer use up the key's `remaining` quota, so retries after a `RATE_LIMITED` error can no longer exhaust or delete the key.
