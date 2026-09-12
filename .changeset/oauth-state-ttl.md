---
"better-auth": patch
"@better-auth/core": patch
"@better-auth/sso": patch
---

Keep the OAuth state cookie alive as long as the state it protects, and make the window configurable via `account.stateExpiresIn`.
