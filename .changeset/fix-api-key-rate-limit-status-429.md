---
"@better-auth/api-key": patch
---

API key requests that exceed the configured rate limit now return HTTP 429 (Too Many Requests) instead of HTTP 401 (Unauthorized), so clients can distinguish throttling from authentication failures.
