---
"@better-auth/api-key": minor
---

API key rate limits now reset on a fixed window even when requests continue throughout the window. This adds the nullable `rateLimitResetAt` field.
