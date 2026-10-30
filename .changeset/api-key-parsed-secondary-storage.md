---
"@better-auth/api-key": patch
---

API keys stored in secondary storage now verify, load, and list correctly when the storage client returns already-parsed JSON objects, such as `@upstash/redis`.
