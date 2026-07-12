---
"better-auth": none
"@better-auth/core": none
---

Replace the flaky MongoDB where-value coercion integration test with a direct `createAdapterFactory` unit test, and fail fast on Mongo connect timeouts in `getTestInstance`.
