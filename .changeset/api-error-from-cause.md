---
"@better-auth/core": patch
---

`APIError.from()` accepts `{ cause }` as a third argument to keep the underlying error for server-side callers without exposing it in the response.
