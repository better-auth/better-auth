---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/telemetry": patch
---

Allow `account.encryptOAuthTokens` to accept custom `encrypt` and `decrypt` functions to control how OAuth tokens are encrypted before they are stored.
