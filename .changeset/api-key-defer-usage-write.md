---
"@better-auth/api-key": patch
---

Verifying a database-stored API key that has no `remaining` count and no rate limiting no longer waits for the `lastRequest` write. The write runs in the background and a failure is logged instead of failing the request.
