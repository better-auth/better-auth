---
"@better-auth/api-key": patch
---

The `keyExpiration.defaultExpiresIn` option is now documented in seconds, matching how it is applied. It was previously described as milliseconds, so values written in milliseconds made default API keys expire 1000 times later than intended.
