---
"@better-auth/api-key": patch
---

Creating or updating an API key returns HTTP 400 when its metadata cannot be read back. Existing keys with unreadable metadata stay visible in listings and can still be deleted.
