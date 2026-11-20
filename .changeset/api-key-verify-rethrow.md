---
"@better-auth/api-key": patch
---

`verifyApiKey` now throws errors that are not an `APIError`, such as a failed database lookup, instead of returning them as `INVALID_API_KEY`, so callers can tell a server failure from an invalid key.
