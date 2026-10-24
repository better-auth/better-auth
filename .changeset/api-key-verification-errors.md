---
"@better-auth/api-key": minor
---

`verifyApiKey` now throws an `APIError` when verification fails to complete instead of reporting an invalid key. Key validation rejections still return `valid: false`.
