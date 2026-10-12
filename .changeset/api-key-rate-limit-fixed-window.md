---
"@better-auth/api-key": patch
---

Stop allowed requests from extending the API key rate-limit window. `rateLimitMax` now counts requests in a fixed `rateLimitTimeWindow` anchored at its first request, so steady traffic below the limit is no longer rejected and `tryAgainIn` reports the time left in the current window.
