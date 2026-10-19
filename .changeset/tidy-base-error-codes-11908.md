---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/i18n": patch
---

Register missing core error codes in `BASE_ERROR_CODES` and standardize core route handlers to throw them via `APIError.from`, with matching translations across all built-in i18n locales
